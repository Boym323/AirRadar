import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getPrisma } from "@/lib/server/db";
import type { Airport } from "@/lib/airports/types";
import { checkPublicRateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

const AIRPORT_CACHE_MS = 5 * 60_000;
let airportCache: { expiresAt: number; airports: Airport[] } | null = null;

function response(airports: Airport[]): Response {
  return Response.json(airports, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const rateLimit = checkPublicRateLimit("airports", request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const now = Date.now();
  if (airportCache && airportCache.expiresAt > now) return response(airportCache.airports);

  const database = getPrisma();
  if (database) {
    try {
      const rows = await database.orm.public.Airport.limit(10000).all();
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
        airportCache = { expiresAt: now + AIRPORT_CACHE_MS, airports };
        return response(airports);
      }
    } catch {
      // The catalog is still useful when the optional database is offline.
    }
  }

  // Do not process-cache the fallback. A transient database outage should be
  // able to recover on the next request while the public HTTP cache still keeps
  // the endpoint inexpensive for clients.
  return response(SAMPLE_AIRPORTS);
}
