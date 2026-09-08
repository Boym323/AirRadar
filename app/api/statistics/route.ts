import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rateLimit = checkPublicRateLimit("statistics");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const service = getAircraftStateService();
  await service.waitForReady();
  return Response.json(service.getStatistics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
