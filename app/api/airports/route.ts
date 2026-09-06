import { SAMPLE_AIRPORTS } from "@/lib/server/airport-catalog";
import { getPrisma } from "@/lib/server/db";
import type { Airport } from "@/lib/airports/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const database = getPrisma();
  if (database) {
    try {
      const airports = await database.orm.public.Airport.all();
      if (airports.length) {
        return Response.json(airports.map((airport): Airport => ({
          icaoCode: airport.icao,
          iataCode: airport.iata,
          name: airport.name,
          city: airport.city,
          country: airport.country,
          latitude: airport.latitude,
          longitude: airport.longitude,
        })), { headers: { "Cache-Control": "public, max-age=300" } });
      }
    } catch {
      // The catalog is still useful when the optional database is offline.
    }
  }
  return Response.json(SAMPLE_AIRPORTS, { headers: { "Cache-Control": "public, max-age=300" } });
}
