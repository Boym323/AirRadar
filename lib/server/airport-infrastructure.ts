import type { Airport } from "@/lib/airports/types";
import { EMPTY_AIRPORT_INFRASTRUCTURE, type AirportInfrastructure, type AirportFrequency, type AirportRunway, type Navaid } from "@/lib/airports/infrastructure";
import { getPrisma } from "@/lib/server/db";

interface AirportIdRow { id: number }
interface InfrastructureDatabase {
  orm: { public: {
    Airport: { where(filter: { icao: string }): { first(): Promise<AirportIdRow | null> } };
    AirportRunway: { where(filter: { airportId: number }): { all(): Promise<AirportRunway[]> } };
    AirportFrequency: { where(filter: { airportId: number }): { all(): Promise<AirportFrequency[]> } };
    Navaid: { where(filter: { associatedAirportId: number }): { all(): Promise<Navaid[]> } };
  } };
}

/** Loads all airport infrastructure with three bounded relation queries. */
export async function getAirportInfrastructure(airport: Airport): Promise<AirportInfrastructure> {
  const database = getPrisma() as unknown as InfrastructureDatabase | null;
  if (!database) return EMPTY_AIRPORT_INFRASTRUCTURE;
  try {
    const row = await database.orm.public.Airport.where({ icao: airport.icaoCode }).first();
    if (!row) return EMPTY_AIRPORT_INFRASTRUCTURE;
    const [runways, frequencies, navaids] = await Promise.allSettled([
      database.orm.public.AirportRunway.where({ airportId: row.id }).all(),
      database.orm.public.AirportFrequency.where({ airportId: row.id }).all(),
      database.orm.public.Navaid.where({ associatedAirportId: row.id }).all(),
    ]);
    return {
      runways: runways.status === "fulfilled" ? runways.value : [],
      frequencies: frequencies.status === "fulfilled" ? frequencies.value : [],
      navaids: navaids.status === "fulfilled" ? navaids.value : [],
    };
  } catch {
    return EMPTY_AIRPORT_INFRASTRUCTURE;
  }
}
