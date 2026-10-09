/**
 * Strict CSP opt-in for the already dynamic /system route only.
 * Never change the global static application policy from this module.
 */
export const CSP_SYSTEM_FLAG = "AIRRADAR_STRICT_CSP_SYSTEM_ENABLED";
export function shouldApplySystemNonceCsp(pathname: string, enabled: string | undefined): boolean {
  return pathname === "/system" && enabled === "true";
}
export function systemNonceContentSecurityPolicy(nonce: string): string {
  if (!/^[A-Za-z0-9+/]{22}==$/.test(nonce)) throw new Error("Expected 128-bit random base64 nonce");
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // The dynamic route receives a nonce in request CSP, so Next.js can attach
    // it to its inline bootstrap and externally loaded JS bundles.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "script-src-attr 'none'",
    // CSS custom properties and Next style output still need a separate
    // style-nonce compatibility migration.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://tiles.openfreemap.org https://t.plnspttrs.net https://www.planespotters.net",
    "connect-src 'self' data: https://tile.openstreetmap.org https://tiles.openfreemap.org",
    "worker-src 'self' blob:",
    "child-src blob:",
    "font-src 'self' data:",
  ].join("; ") + ";";
}
