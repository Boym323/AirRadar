import { getAtcPredictionValidation } from "@/lib/server/atc-prediction-validation";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("atcSectors", request);
  if (!limited.allowed) return rateLimitResponse(limited);
  return Response.json(getAtcPredictionValidation().getSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
