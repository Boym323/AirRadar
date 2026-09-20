import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getPrisma } from "@/lib/server/db";
import type { Airport } from "@/lib/airports/types";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { haversineDistanceKm } from "@/lib/geo";
import { AIRPORT_MAP_RADIUS_NM } from "@/lib/airport-visibility";

export const dynamic = "force-dynamic";

const AIRPORT_CACHE_MS = 5 * 60_000;
let airportCache: { key: string; expiresAt: number; airports: Airport[] } | null = null;

function response(airports: Airport[]): Response {
  return Response.json(airports, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airports", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const params = new URL(request.url).searchParams;
  const rawLat = params.get("lat");
  const rawLon = params.get("lon");
  const rawRadius = params.get("radiusNm");
  const hasCoordinates = rawLat !== null || rawLon !== null;
  if (hasCoordinates && (rawLat === null || rawLon === null)) return Response.json({ error: "lat and lon are required together" }, { status: 400 });
  const lat = rawLat === null ? null : Number(rawLat);
  const lon = rawLon === null ? null : Number(rawLon);
  if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90) || lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) {
    return Response.json({ error: "invalid receiver coordinates" }, { status: 400 });
  }
  const radius = rawRadius === null ? AIRPORT_MAP_RADIUS_NM : Number(rawRadius);
  if (!Number.isFinite(radius) || radius < 25) return Response.json({ error: "invalid airport radius" }, { status: 400 });
  const boundedRadiusNm = Math.min(500, radius);
  const radiusKm = boundedRadiusNm * 1.852;
  const cacheKey = lat === null || lon === null ? "fallback" : `${lat}:${lon}:${boundedRadiusNm}`;
  const now = Date.now();
  if (airportCache && airportCache.key === cacheKey && airportCache.expiresAt > now) return response(airportCache.airports);

  const database = getPrisma();
  if (database) {
    try {
      const table = database.orm.public.Airport;
      let query = table;
      if (lat !== null && lon !== null) {
        const radiusLat = radiusKm / 111.32;
        const radiusLon = radiusKm / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.2));
        query = query
          .where((airport) => airport.latitude.gte(Math.max(-90, lat - radiusLat)))
          .where((airport) => airport.latitude.lte(Math.min(90, lat + radiusLat)))
          .where((airport) => airport.longitude.gte(Math.max(-180, lon - radiusLon)))
          .where((airport) => airport.longitude.lte(Math.min(180, lon + radiusLon)));
      }
      const rows = await query.limit(10000).all();
      if (rows.length) {
        const airports = rows.map((airport): Airport => ({
          icaoCode: airport.icao,
          iataCode: airport.iata,
          name: airport.name,
          city: airport.city,
          country: airport.country,
          latitude: airport.latitude,
          longitude: airport.longitude,
          ...(airport.type !== undefined
            ? {
                type: airport.type,
                elevationFt: airport.elevationFt,
                scheduledService: airport.scheduledService,
                region: airport.region,
                localCode: airport.localCode,
              }
            : {}),
        }));
        const filtered = lat === null || lon === null
          ? airports
          : airports.filter((airport: Airport) => haversineDistanceKm(lat, lon, airport.latitude, airport.longitude) <= radiusKm);
        airportCache = { key: cacheKey, expiresAt: now + AIRPORT_CACHE_MS, airports: filtered };
        return response(filtered);
      }
    } catch {
      // The catalog is still useful when the optional database is offline.
    }
  }

  // Do not process-cache the fallback. A transient database outage should be
  // able to recover on the next request while the public HTTP cache still keeps
  // the endpoint inexpensive for clients.
  const fallback = lat === null || lon === null
    ? SAMPLE_AIRPORTS
    : SAMPLE_AIRPORTS.filter((airport) => haversineDistanceKm(lat, lon, airport.latitude, airport.longitude) <= radiusKm);
  return response(fallback);
}
