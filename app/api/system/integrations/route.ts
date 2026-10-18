import { isWatchlistAdminSessionValid } from "@/lib/server/watchlist-auth";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getIntegrationDiagnostics } from "@/lib/server/integration-diagnostics";
import { toPublicIntegrationDiagnostics } from "@/lib/server/public-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const rate = checkPublicRateLimit("systemStatus", request);
  if (!rate.allowed) return rateLimitResponse(rate);
  const diagnostics = getIntegrationDiagnostics();
  return Response.json(isWatchlistAdminSessionValid(request) ? diagnostics : toPublicIntegrationDiagnostics(diagnostics), { headers });
}
