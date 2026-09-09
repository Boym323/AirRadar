import { getAtcData } from "@/lib/server/providers";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rateLimit = checkPublicRateLimit("atcSectors");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  return Response.json(await getAtcData(), {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
