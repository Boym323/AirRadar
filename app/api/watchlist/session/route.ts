import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import {
  clearWatchlistSessionCookie,
  isWatchlistAuthConfigured,
  isWatchlistSessionValid,
  verifyWatchlistAdminToken,
  watchlistSessionCookie,
} from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";

function headers(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  return Response.json({ configured: isWatchlistAuthConfigured(), authenticated: isWatchlistSessionValid(request) }, { headers: headers() });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  if (!isWatchlistAuthConfigured()) return Response.json({ error: "Watchlist authentication is not configured", code: "auth_unavailable" }, { status: 503, headers: headers() });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const token = body && typeof body === "object" && "token" in body ? body.token : null;
  if (!verifyWatchlistAdminToken(token)) return Response.json({ error: "Invalid watchlist token", code: "auth_failed" }, { status: 401, headers: headers() });
  return Response.json({ configured: true, authenticated: true }, { headers: { ...headers(), "Set-Cookie": watchlistSessionCookie(request, token as string) } });
}

export async function DELETE(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("watchlist", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  return Response.json({ configured: isWatchlistAuthConfigured(), authenticated: false }, { headers: { ...headers(), "Set-Cookie": clearWatchlistSessionCookie(request) } });
}
