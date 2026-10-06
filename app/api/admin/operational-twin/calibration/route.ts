import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { isWatchlistSessionValid } from "@/lib/server/watchlist-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isWatchlistSessionValid(request)) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const service = getAircraftStateService();
  const corridor = service.getOperationalTwinOutcomeReport();
  const event = service.getOperationalTwinEventOutcomeReport();
  const regionalAttention = service.getRegionalAttentionOutcomeReport();
  const regionalAttentionGraduation = service.getRegionalAttentionGraduationReport();

  return Response.json({
    version: "digital-twin-calibration-center-v1",
    generatedAt: new Date().toISOString(),
    corridor,
    event,
    truthFirst: event.truthFirst,
    windTiming: event.windTimingGraduation,
    regionalAttention,
    regionalAttentionGraduation,
    persistence: event.calibrationPersistence,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
