import { describe, expect, it } from "vitest";
import { evaluateSecurityHeaders, validAuditOrigin } from "../scripts/audit-ops-headers.mjs";

describe("read-only operational security probe", () => {
  it("detects a wrongly denied Spotter permission even if CSP is present", () => {
    const responseHeaders = new Headers({
      "Permissions-Policy":"camera=(), geolocation=(), microphone=()",
      "Content-Security-Policy":"object-src 'none'; frame-ancestors 'none'; script-src 'self';",
    });
    expect(evaluateSecurityHeaders(responseHeaders).findings).toEqual(["GEOLOCATION_NOT_SELF_ONLY"]);
  });
  it("requires strict nonce only under explicit opt-in and fails open CSP checks otherwise", () => {
    const nonce = Buffer.alloc(16, 2).toString("base64");
    const headers = new Headers({
      "Permissions-Policy":"geolocation=(self)",
      "Content-Security-Policy":`object-src 'none'; frame-ancestors 'none'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; script-src-attr 'none';`,
    });
    expect(evaluateSecurityHeaders(headers, {requireNonce:true,requireHardened:true})).toMatchObject({ok:true,nonce});
    const unsafe = new Headers(headers);
    unsafe.set("Content-Security-Policy", "object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline';");
    expect(evaluateSecurityHeaders(unsafe, {requireNonce:true,requireHardened:true}).ok).toBe(false);
  });
  it("rejects non-local plaintext URLs and origins containing credentials", () => {
    expect(() => validAuditOrigin("http://example.org")).toThrow();
    expect(() => validAuditOrigin("https://password:secret@example.org/")).toThrow();
    expect(() => validAuditOrigin("https://example.org/foo")).toThrow();
    expect(validAuditOrigin("http://127.0.0.1:3000").origin).toBe("http://127.0.0.1:3000");
  });
});
