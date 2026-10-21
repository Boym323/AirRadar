import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getLogbookSummary } from "@/lib/server/logbook-summary";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("logbookSummary", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  await service.waitForReady();
  const snapshot = service.getSnapshot();
  const summary = await getLogbookSummary(snapshot.aircraft, snapshot.stats);
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}
