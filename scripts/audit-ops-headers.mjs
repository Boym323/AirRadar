#!/usr/bin/env node
/**
 * Explicit read-only production header probe. No application writes, secrets,
 * receiver position or authentication data are logged.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function evaluateSecurityHeaders(headers, options = {}) {
  const get = key => headers.get(key) ?? "";
  const csp = get("content-security-policy");
  const permissions = get("permissions-policy");
  const findings = [];
  if (!permissions.includes("geolocation=(self)"))
    findings.push("GEOLOCATION_NOT_SELF_ONLY");
  if (!csp.includes("object-src 'none'")) findings.push("OBJECT_SRC_NOT_BLOCKED");
  if (!csp.includes("frame-ancestors 'none'")) findings.push("FRAME_ANCESTORS_UNPROTECTED");
  if (options.requireHardened && !csp.includes("script-src-attr 'none'"))
    findings.push("INLINE_HTML_EVENT_HANDLERS_NOT_BLOCKED");
  const nonce = csp.match(/'nonce-([A-Za-z0-9+/]{22}==)'/)?.[1] ?? null;
  if (options.requireNonce && (!nonce || csp.match(/script-src [^;]+/)?.[0]?.includes("'unsafe-inline'")))
    findings.push("STRICT_SCRIPT_NONCE_NOT_ENFORCED");
  return {
    ok: findings.length === 0,
    findings,
    nonce,
    hasCsp: Boolean(csp),
    hasPermissionsPolicy: Boolean(permissions),
  };
}

export function validAuditOrigin(input) {
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Audit origin must not contain credentials, query, fragment or path");
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return url;
  throw new Error("Use HTTPS or local loopback HTTP only");
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--origin");
  if (i < 0 || !args[i + 1]) throw new Error("Usage: npm run ops:audit:headers -- --origin https://airradar.example [--require-hardened] [--require-nonce]");
  const flags = ["--origin", "--require-hardened", "--require-nonce"];
  if (args.filter(x => !flags.includes(x)).length !== 1) throw new Error("Unknown options");
  const origin = validAuditOrigin(args[i+1]);
  const options = { requireHardened: args.includes("--require-hardened"), requireNonce: args.includes("--require-nonce") };
  const system = new URL("/system", origin);
  const headers = {Accept: "text/html", "Cache-Control": "no-cache"};
  const first = await fetch(system, {headers, redirect:"error", signal: AbortSignal.timeout(8000)});
  const firstCheck = evaluateSecurityHeaders(first.headers, options);
  await first.body?.cancel();
  const findings = [...firstCheck.findings];
  if (!first.ok) findings.push("SYSTEM_HTTP_" + first.status);
  if (options.requireNonce && firstCheck.nonce) {
    const next = await fetch(system, {headers, redirect:"error", signal: AbortSignal.timeout(8000)});
    const secondCheck = evaluateSecurityHeaders(next.headers, options);
    await next.body?.cancel();
    if (!secondCheck.nonce || firstCheck.nonce === secondCheck.nonce) findings.push("NONCE_NOT_UNIQUE_PER_REQUEST");
  }
  const output = {
    version:"airradar-header-preflight-v1", origin:origin.origin, route:"/system",
    ok:findings.length===0, findings,
    hasCsp:firstCheck.hasCsp, hasPermissionsPolicy:firstCheck.hasPermissionsPolicy,
    // Never echo raw CSP header: it contains random nonce data.
  };
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    console.error("[security header audit]", error instanceof Error ? error.message : "unknown");
    process.exitCode = 1;
  });
}
