import { getAirspaceActivity } from "@/lib/server/airspace-activity";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultMapContextArchive } from "@/lib/server/map-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airspaceActivity", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const result = await getAirspaceActivity();
  if (result.planned.status !== "unavailable") void defaultMapContextArchive.addAup(result.planned);
  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" },
  });
}
