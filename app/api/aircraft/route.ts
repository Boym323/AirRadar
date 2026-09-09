import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { toPublicStateSnapshot } from "@/lib/server/public-serialization";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  await service.waitForReady();
  return Response.json(toPublicStateSnapshot(service.getSnapshot()), {
    headers: { "Cache-Control": "no-store" },
  });
}
