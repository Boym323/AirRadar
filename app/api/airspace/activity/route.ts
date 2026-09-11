import { getAirspaceActivity } from "@/lib/server/airspace-activity";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airspaceActivity", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  return Response.json(await getAirspaceActivity(), {
    headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
  });
}
