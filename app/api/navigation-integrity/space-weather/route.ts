import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultSpaceWeatherProvider, isSpaceWeatherEnabled, SPACE_WEATHER_DISCLAIMER } from "@/lib/server/space-weather";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** External geomagnetic context only; never mixes into Navigation Integrity detections. */
export async function GET(request: Request): Promise<Response> {
  if (!isSpaceWeatherEnabled()) {
    return Response.json({ enabled: false, available: false, provider: "NOAA SWPC", disclaimer: SPACE_WEATHER_DISCLAIMER }, { headers: { "Cache-Control": "no-store" } });
  }
  const limit = checkPublicRateLimit("mapContext", request);
  if (!limit.allowed) return rateLimitResponse(limit);
  return Response.json(await defaultSpaceWeatherProvider.getCurrent(), { headers: { "Cache-Control": "no-store" } });
}
