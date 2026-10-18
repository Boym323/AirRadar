import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getRuntimeTelemetryHistory } from "@/lib/server/runtime-telemetry";
import { isWatchlistAdminSessionValid } from "@/lib/server/watchlist-auth";
import { toPublicRuntimeHistory } from "@/lib/server/public-diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("runtimeTelemetry", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const history = getRuntimeTelemetryHistory();
  return Response.json(isWatchlistAdminSessionValid(request) ? history : toPublicRuntimeHistory(history), {
    headers: { "Cache-Control": "no-store" },
  });
}
