import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getIntegrationDiagnostics } from "@/lib/server/integration-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sensitive operational diagnostics are available only to an existing admin session. */
export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store" };
  const rate = checkPublicRateLimit("systemStatus", request);
  if (!rate.allowed) return rateLimitResponse(rate);
  if (!isWatchlistSessionValid(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  return Response.json(getIntegrationDiagnostics(), { headers });
}
