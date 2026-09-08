import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getReceptionRecords } from "@/lib/server/reception-records";
import { getLogbookSummary } from "@/lib/server/logbook-summary";
import { listWatchlistRules } from "@/lib/server/watchlist-store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rateLimit = checkPublicRateLimit("logbookSummary");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  await service.waitForReady();
  const snapshot = service.getSnapshot();
  const reception = await getReceptionRecords(service.getDailyReceptionRecord());
  const rules = await listWatchlistRules();
  const summary = await getLogbookSummary(snapshot.aircraft, snapshot.stats, rules, reception);
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
}
