import { getTimeMachineRange } from "@/lib/server/time-machine";
import { defaultMapContextArchive, defaultWeatherRadarArchive, getMapContextMaxAgeMs } from "@/lib/server/map-context";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const limited = checkPublicRateLimit("mapContext", request);
  if (!limited.allowed) return rateLimitResponse(limited);
  try {
    const [traffic, context, radar] = await Promise.all([
      getTimeMachineRange().catch(() => ({ min: null, max: null, positions: null })),
      defaultMapContextArchive.range(),
      defaultWeatherRadarArchive.listFrames(),
    ]);
    const cutoff = new Date(Date.now() - getMapContextMaxAgeMs()).toISOString();
    return Response.json({
      traffic: { minAvailableAt: traffic.min, maxAvailableAt: traffic.max },
      radar: { minAvailableAt: radar[0]?.at ?? null, maxAvailableAt: radar.at(-1)?.at ?? null },
      metar: context.metar,
      wind: context.wind,
      aup: context.aup,
      retentionFloor: cutoff,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Map context range unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
