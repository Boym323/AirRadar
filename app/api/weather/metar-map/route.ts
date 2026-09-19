import { WEATHER_RADAR_BOUNDS } from "@/lib/server/weather-radar/types";
import { defaultAviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getPrisma } from "@/lib/server/db";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { defaultMapContextArchive } from "@/lib/server/map-context";

export const dynamic = "force-dynamic";

const MAX_STATIONS = 256;

function numberParam(value: string | null, fallback: number): number {
  const number = value === null ? Number.NaN : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validBounds(url: URL): { west: number; south: number; east: number; north: number } | null {
  const west = numberParam(url.searchParams.get("west"), WEATHER_RADAR_BOUNDS.west);
  const south = numberParam(url.searchParams.get("south"), WEATHER_RADAR_BOUNDS.south);
  const east = numberParam(url.searchParams.get("east"), WEATHER_RADAR_BOUNDS.east);
  const north = numberParam(url.searchParams.get("north"), WEATHER_RADAR_BOUNDS.north);
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north || east - west > 30 || north - south > 20) return null;
  return { west, south, east, north };
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("weather", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
  const bounds = validBounds(new URL(request.url));
  if (!bounds) return Response.json({ error: "Invalid METAR map bounds" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  let airports: Array<{ icaoCode: string; latitude: number; longitude: number }> = SAMPLE_AIRPORTS.map((airport) => ({ icaoCode: airport.icaoCode, latitude: airport.latitude, longitude: airport.longitude }));
  const database = getPrisma();
  if (database) {
    try {
      const rows = await database.orm.public.Airport.limit(10_000).all();
      if (rows.length) airports = rows.map((row) => ({ icaoCode: row.icao, latitude: row.latitude, longitude: row.longitude }));
    } catch {
      // The sample catalog remains a deterministic fallback.
    }
  }
  const stations = [...new Map(airports
    .filter((airport) => /^[A-Z]{4}$/.test(airport.icaoCode) && airport.latitude >= bounds.south && airport.latitude <= bounds.north && airport.longitude >= bounds.west && airport.longitude <= bounds.east)
    .map((airport) => [airport.icaoCode, { stationId: airport.icaoCode, lat: airport.latitude, lon: airport.longitude }])).values()].slice(0, MAX_STATIONS);
  if (!stations.length) return Response.json({ enabled: true, available: true, source: "Aviation Weather Center", observations: [], fetchedAt: new Date().toISOString(), stale: false }, { headers: { "Cache-Control": "no-store" } });
  try {
    const result = await defaultAviationWeatherProvider.getMetarMap(stations, request.signal);
    void defaultMapContextArchive.addMetar(result.observations, result.fetchedAt);
    return Response.json({ enabled: true, available: true, source: result.source, stations: result.observations.length, observations: result.observations, fetchedAt: result.fetchedAt, stale: result.stale }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "METAR map data temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
