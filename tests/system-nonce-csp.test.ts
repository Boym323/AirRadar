import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldApplySystemNonceCsp, systemNonceContentSecurityPolicy } from "@/lib/security/system-nonce-csp";

describe("staged strict script CSP", () => {
  it("is off by default, restricted to the existing dynamic /system page", () => {
    expect(shouldApplySystemNonceCsp("/system", undefined)).toBe(false);
    expect(shouldApplySystemNonceCsp("/system", "false")).toBe(false);
    expect(shouldApplySystemNonceCsp("/", "true")).toBe(false);
    expect(shouldApplySystemNonceCsp("/system/extra", "true")).toBe(false);
    expect(shouldApplySystemNonceCsp("/api/system/status", "true")).toBe(false);
    expect(shouldApplySystemNonceCsp("/system", "true")).toBe(true);
    const systemPage = readFileSync(new URL("../app/system/page.tsx", import.meta.url), "utf8");
    expect(systemPage).toContain('dynamic = "force-dynamic"');
  });
  it("never authorizes unsafe inline JavaScript even when Next injects a nonce", () => {
    const nonce = Buffer.alloc(16, 1).toString("base64");
    const policy = systemNonceContentSecurityPolicy(nonce);
    const script = policy.match(/script-src [^;]+/)?.[0] ?? "";
    expect(script).toContain(`'nonce-${nonce}'`);
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(() => systemNonceContentSecurityPolicy("predictable")).toThrow();
  });
  it("generates fresh 128-bit nonces and carries CSP to Next request headers", () => {
    const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
    expect(proxy).toContain("randomBytes(16)");
    expect(proxy).toContain('headers.set("Content-Security-Policy", csp)');
    expect(proxy).toContain('response.headers.set("Content-Security-Policy", csp)');
    expect(proxy).toContain('headers.set("x-nonce", nonce)');
    expect(proxy).toContain('matcher: ["/system"]');
  });
});
