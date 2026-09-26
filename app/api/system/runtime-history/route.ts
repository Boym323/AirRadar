import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getRuntimeTelemetryHistory } from "@/lib/server/runtime-telemetry";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("runtimeTelemetry", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  if (!isWatchlistSessionValid(request)) {
    return Response.json(
      { error: "Authentication required", code: "auth_required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const history = getRuntimeTelemetryHistory();
  return Response.json(history, {
    headers: { "Cache-Control": "no-store" },
  });
}
