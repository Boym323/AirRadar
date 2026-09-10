import type { Airport } from "@/lib/airports/types";
import { airportFromCode } from "@/lib/server/airport-catalog";
import { getPrisma } from "@/lib/server/db";

export interface AirportProviderMetadata {
  icaoCode?: string | null;
  iataCode?: string | null;
  name?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface AirportResolveInput {
  icaoCode?: string | null;
  iataCode?: string | null;
  providerAirport?: AirportProviderMetadata | null;
}

export interface AirportDatabaseRow {
  id?: number;
  icao: string;
  iata: string | null;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  type?: string | null;
  elevationFt?: number | null;
  scheduledService?: boolean | null;
  region?: string | null;
  localCode?: string | null;
}

export interface AirportDatabase {
  orm: {
    public: {
      Airport: {
        where(filter: { id?: number; icao?: string; iata?: string; ourAirportsId?: number }): {
          first(): Promise<AirportDatabaseRow | null>;
        };
      };
    };
  };
}

export interface AirportResolverLike {
  resolve(input: AirportResolveInput): Promise<Airport | null>;
}

export function normalizeAirportIcao(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(normalized) ? normalized : null;
}

export function normalizeAirportIata(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function validCoordinatePair(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === "number"
    && Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && typeof longitude === "number"
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function airportFromDatabase(row: AirportDatabaseRow | null): Airport | null {
  if (!row || !validCoordinatePair(row.latitude, row.longitude)) return null;
  const icaoCode = normalizeAirportIcao(row.icao);
  if (!icaoCode) return null;
  const airport: Airport = {
    icaoCode,
    iataCode: normalizeAirportIata(row.iata),
    name: row.name,
    city: row.city,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
  };
  if (row.type !== undefined) airport.type = row.type;
  if (row.elevationFt !== undefined) airport.elevationFt = row.elevationFt;
  if (row.scheduledService !== undefined) airport.scheduledService = row.scheduledService;
  if (row.region !== undefined) airport.region = row.region;
  if (row.localCode !== undefined) airport.localCode = row.localCode;
  return airport;
}

function airportFromProvider(
  input: AirportResolveInput,
  normalizedIcao: string | null,
  normalizedIata: string | null,
): Airport | null {
  const provider = input.providerAirport;
  if (!provider || !validCoordinatePair(provider.latitude, provider.longitude)) return null;

  const providerIcao = normalizedIcao ?? normalizeAirportIcao(provider.icaoCode);
  const providerIata = normalizedIata ?? normalizeAirportIata(provider.iataCode);
  // IATA is route/display metadata only. Weather and airport identity require ICAO.
  const code = providerIcao;
  if (!code) return null;

  return {
    icaoCode: code,
    iataCode: providerIata,
    name: textValue(provider.name) ?? code,
    city: textValue(provider.city),
    country: textValue(provider.country),
    latitude: provider.latitude!,
    longitude: provider.longitude!,
  };
}

/**
 * Resolves route airport metadata from the local catalog, with bounded
 * provider/sample fallbacks. Database errors are intentionally swallowed:
 * enrichment must never affect the live radar path.
 */
export class AirportResolver implements AirportResolverLike {
  constructor(private readonly databaseProvider: () => AirportDatabase | null = getPrisma) {}

  async resolve(input: AirportResolveInput): Promise<Airport | null> {
    const icaoCode = normalizeAirportIcao(input.icaoCode) ?? normalizeAirportIcao(input.providerAirport?.icaoCode);
    const iataCode = normalizeAirportIata(input.iataCode) ?? normalizeAirportIata(input.providerAirport?.iataCode);

    if (!icaoCode && !iataCode) return null;

    let database: AirportDatabase | null = null;
    try {
      database = this.databaseProvider();
      if (database) {
        if (icaoCode) {
          const airport = airportFromDatabase(await database.orm.public.Airport.where({ icao: icaoCode }).first());
          if (airport) return airport;
        }
        if (iataCode) {
          const airport = airportFromDatabase(await database.orm.public.Airport.where({ iata: iataCode }).first());
          if (airport) return airport;
        }
      }
    } catch {
      // The local catalog is optional for live operation. Continue below.
    }

    const providerAirport = airportFromProvider(input, icaoCode, iataCode);
    if (providerAirport) return providerAirport;

    // Keep the existing sample catalog as the final emergency/demo fallback.
    const sampleCode = icaoCode ?? iataCode;
    return sampleCode ? airportFromCode(sampleCode) : null;
  }
}

export const defaultAirportResolver: AirportResolverLike = new AirportResolver();

export function resolveAirport(input: AirportResolveInput): Promise<Airport | null> {
  return defaultAirportResolver.resolve(input);
}
