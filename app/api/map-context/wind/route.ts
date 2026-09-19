import { defaultMapContextArchive, isWindLevelParam, validateMapContextAt } from "@/lib/server/map-context";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("mapContext", request);
  if (!limited.allowed) return rateLimitResponse(limited);
  const url = new URL(request.url);
  if (!isWindLevelParam(url.searchParams.get("level"))) return Response.json({ error: "Invalid pressure level" }, { status: 400 });
  try {
    const at = validateMapContextAt(url.searchParams.get("at"));
    return Response.json(await defaultMapContextArchive.resolveWindAt(at, Number(url.searchParams.get("level")) as 850 | 700 | 500 | 300 | 200), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Historical wind unavailable" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
