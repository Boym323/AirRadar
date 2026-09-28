import { AIRCRAFT_WEATHER_LIMITS, getAircraftWeatherProfile } from "@/lib/server/aircraft-weather";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
const noStore = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? 50);
  const windowMinutes = Number(url.searchParams.get("windowMinutes") ?? 30);
  const binSizeFt = Number(url.searchParams.get("binSizeFt") ?? AIRCRAFT_WEATHER_LIMITS.defaultBinSizeFt);
  const now = new Date();
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > AIRCRAFT_WEATHER_LIMITS.maxRadiusKm || !Number.isFinite(windowMinutes) || windowMinutes <= 0 || windowMinutes > 90 || !Number.isFinite(binSizeFt) || binSizeFt < 500 || binSizeFt > 10_000) return noStore({ error: "Invalid aircraft weather profile query" }, 400);
  try {
    return noStore(await getAircraftWeatherProfile({ lat, lon, radiusKm, from: new Date(now.getTime() - windowMinutes * 60_000), to: now, binSizeFt }));
  } catch {
    return noStore({ error: "Aircraft weather profile temporarily unavailable" }, 503);
  }
}
