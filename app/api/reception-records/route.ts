import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getReceptionRecords } from "@/lib/server/reception-records";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("receptionRecords", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  await service.waitForReady();
  return Response.json(await getReceptionRecords(service.getDailyReceptionRecord()), {
    headers: { "Cache-Control": "no-store" },
  });
}
