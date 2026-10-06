import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { getStatisticsHeatmap } from "@/lib/server/statistics-heatmap";
import { parseStatisticsHeatmapRange } from "@/lib/statistics-heatmap";

export const dynamic = "force-dynamic";
const headers: HeadersInit = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("statistics", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const range = parseStatisticsHeatmapRange(new URL(request.url).searchParams.get("range"));
  if (!range) return Response.json({ error: "Invalid heatmap range" }, { status: 400, headers });
  return Response.json(await getStatisticsHeatmap(range), { headers });
}
