import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { getReceiverRecap } from "@/lib/server/recap";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("recap", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const range = new URL(request.url).searchParams.get("range") === "weekly" ? "weekly" : "daily";
  const service = getAircraftStateService();
  await service.waitForReady();
  return Response.json(await getReceiverRecap(range, { currentDay: service.getStatisticsCurrentDaySnapshot(), todayRecord: service.getDailyReceptionRecord() }), { headers: { "Cache-Control": "no-store" } });
}
