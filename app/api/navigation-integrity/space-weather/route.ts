import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultNoaaSpaceWeatherProvider } from "@/lib/server/noaa-space-weather";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const limit = checkPublicRateLimit("mapContext", request);
  if (!limit.allowed) return rateLimitResponse(limit);
  if (process.env.SPACE_WEATHER_ENABLED?.trim().toLowerCase() !== "true") {
    return Response.json({ enabled: false, available: false, provider: "NOAA SWPC" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const data = await defaultNoaaSpaceWeatherProvider.getContext();
  return Response.json({ enabled: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}
