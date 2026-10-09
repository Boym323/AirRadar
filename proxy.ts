import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { shouldApplySystemNonceCsp, systemNonceContentSecurityPolicy } from "@/lib/security/system-nonce-csp";

/**
 * Narrow security rollout: /system is already force-dynamic.
 * A flag is required on the server to enforce script nonce CSP; static radar
 * pages keep their existing policy and performance profile by default.
 */
export function proxy(request: NextRequest) {
  if (!shouldApplySystemNonceCsp(request.nextUrl.pathname,
    process.env.AIRRADAR_STRICT_CSP_SYSTEM_ENABLED)) return NextResponse.next();

  const nonce = randomBytes(16).toString("base64");
  const csp = systemNonceContentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", csp);
  headers.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/system"] };
