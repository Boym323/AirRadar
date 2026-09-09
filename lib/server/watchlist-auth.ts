import { createHmac, timingSafeEqual } from "node:crypto";
import { getWatchlistAdminToken } from "@/lib/server/config";

export const WATCHLIST_SESSION_COOKIE = "airradar_watchlist_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function sameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieValue(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${WATCHLIST_SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol : url.protocol.slice(0, -1);
  return `${protocol}://${request.headers.get("host") ?? url.host}`;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === requestOrigin(request);
}

function sessionValue(secret: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${signature(payload, secret)}`;
}

function validSession(request: Request, secret: string, now = Date.now()): boolean {
  const raw = cookieValue(request);
  if (!raw) return false;
  const [expiresAt, suppliedSignature] = raw.split(".");
  if (!expiresAt || !suppliedSignature || Number(expiresAt) <= Math.floor(now / 1000)) return false;
  return sameSecret(suppliedSignature, signature(expiresAt, secret));
}

export function isWatchlistAuthConfigured(): boolean {
  return getWatchlistAdminToken() !== null;
}

export function isWatchlistSessionValid(request: Request, now = Date.now()): boolean {
  const secret = getWatchlistAdminToken();
  return Boolean(secret && validSession(request, secret, now));
}

export function requireWatchlistMutation(request: Request): Response | null {
  if (!isWatchlistAuthConfigured()) {
    return Response.json({ error: "Watchlist authentication is not configured", code: "auth_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin watchlist mutation rejected", code: "csrf_rejected" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!isWatchlistSessionValid(request)) {
    return Response.json({ error: "Watchlist authentication required", code: "auth_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

export function watchlistSessionCookie(request: Request, token: string): string {
  const value = sessionValue(token);
  const protocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase() || new URL(request.url).protocol.slice(0, -1);
  const secure = protocol === "https" ? "; Secure" : "";
  return `${WATCHLIST_SESSION_COOKIE}=${value}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/api/watchlist; HttpOnly; SameSite=Strict${secure}`;
}

export function clearWatchlistSessionCookie(request: Request): string {
  const protocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim().toLowerCase() || new URL(request.url).protocol.slice(0, -1);
  const secure = protocol === "https" ? "; Secure" : "";
  return `${WATCHLIST_SESSION_COOKIE}=; Max-Age=0; Path=/api/watchlist; HttpOnly; SameSite=Strict${secure}`;
}

export function verifyWatchlistAdminToken(candidate: unknown): boolean {
  const secret = getWatchlistAdminToken();
  return typeof candidate === "string" && Boolean(secret) && sameSecret(candidate.trim(), secret!);
}
