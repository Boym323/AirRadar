import { defaultMapContextArchive, validateMapContextAt } from "@/lib/server/map-context";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("mapContext", request);
  if (!limited.allowed) return rateLimitResponse(limited);
  try {
    const at = validateMapContextAt(new URL(request.url).searchParams.get("at"));
    return Response.json(await defaultMapContextArchive.resolveMetarAt(at), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Historical METAR unavailable" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
