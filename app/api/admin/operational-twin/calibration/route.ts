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
  const trajectoryQuality = service.getOperationalTwinTrajectoryQualityOutcomeReport();
  const trajectoryQualityGraduation = service.getOperationalTwinTrajectoryQualityGraduationReport();
  const event = service.getOperationalTwinEventOutcomeReport();
  const focus = service.getOperationalFocusOutcomeReport();
  const regionalAttention = service.getRegionalAttentionOutcomeReport();
  const regionalAttentionGraduation = service.getRegionalAttentionGraduationReport();

  return Response.json({
    version: "digital-twin-calibration-center-v1",
    generatedAt: new Date().toISOString(),
    corridor,
    trajectoryQuality,
    trajectoryQualityGraduation,
    event,
    focus,
    truthFirst: event.truthFirst,
    windTiming: event.windTimingGraduation,
    regionalAttention,
    regionalAttentionGraduation,
    persistence: event.calibrationPersistence,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
