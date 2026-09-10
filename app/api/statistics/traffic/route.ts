import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getStatisticsTraffic } from "@/lib/server/statistics-traffic";
import { parseStatisticsTrafficRange } from "@/lib/statistics-traffic";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("statistics", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const range = parseStatisticsTrafficRange(new URL(request.url).searchParams.get("range"));
  if (!range) {
    return Response.json({ error: "Invalid statistics traffic range" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  return Response.json(await getStatisticsTraffic(range), { headers: NO_STORE_HEADERS });
}
