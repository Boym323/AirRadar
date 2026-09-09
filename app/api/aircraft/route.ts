import { getAircraftStateService } from "@/lib/server/aircraft-state";
import { toPublicStateSnapshot } from "@/lib/server/public-serialization";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { parseCoverage } from "@/lib/server/coverage";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("aircraft", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const service = getAircraftStateService();
  await service.waitForReady();
  const coverage = parseCoverage(new URL(request.url).searchParams.get("coverage"));
  return Response.json(toPublicStateSnapshot(service.getSnapshot({ coverage })), {
    headers: { "Cache-Control": "no-store" },
  });
}
