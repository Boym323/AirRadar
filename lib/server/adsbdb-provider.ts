import type { AircraftMetadata, FlightRoute } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import { airportFromCode } from "@/lib/server/airport-catalog";
import type { AircraftMetadataProvider, FlightRouteProvider } from "@/lib/server/provider";

interface AdsbDbResponse {
  response?: {
    aircraft?: Record<string, unknown>;
    flightroute?: Record<string, unknown>;
  } | string;
}

function value(record: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function nested(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | null {
  const candidate = record?.[key];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : null;
}

function numberValue(record: Record<string, unknown> | undefined, key: string): number | null {
  const candidate = record?.[key];
  const parsed = typeof candidate === "number" ? candidate : typeof candidate === "string" ? Number(candidate) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function airport(record: Record<string, unknown> | null): Airport | null {
  if (!record) return null;
  const icaoCode = value(record, "icao_code", "icao", "icaoCode");
  const iataCode = value(record, "iata_code", "iata", "iataCode");
  const latitude = numberValue(record, "latitude");
  const longitude = numberValue(record, "longitude");
  const fallback = airportFromCode(icaoCode ?? iataCode);
  if (latitude === null || longitude === null) return fallback;
  return {
    icaoCode: icaoCode ?? fallback?.icaoCode ?? "UNKNOWN",
    iataCode: iataCode ?? fallback?.iataCode ?? null,
    name: value(record, "name") ?? fallback?.name ?? (icaoCode ?? iataCode ?? "Unknown airport"),
    city: value(record, "municipality", "city") ?? fallback?.city ?? null,
    country: value(record, "country_name", "country") ?? fallback?.country ?? null,
    latitude,
    longitude,
  };
}

function endpoint(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), base).toString();
}

async function fetchAdsbDb<T>(baseUrl: string, path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(endpoint(baseUrl, path), { cache: "no-store", signal: controller.signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`ADSBDB returned HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export class AdsbDbProvider implements AircraftMetadataProvider, FlightRouteProvider {
  readonly name = "adsbdb";

  constructor(private readonly baseUrl = "https://api.adsbdb.com/v0") {}

  async getMetadata(icaoHex: string): Promise<AircraftMetadata | null> {
    const payload = await fetchAdsbDb<AdsbDbResponse>(this.baseUrl, `/aircraft/${encodeURIComponent(icaoHex.toLowerCase())}`);
    const response = payload?.response;
    if (!response || typeof response === "string") return null;
    const aircraft = response.aircraft;
    if (!aircraft) return null;
    return {
      registration: value(aircraft, "registration"),
      registrationCountry: value(aircraft, "registered_owner_country_name"),
      registrationCountryCode: value(aircraft, "registered_owner_country_iso_name"),
      aircraftType: value(aircraft, "type"),
      icaoTypeCode: value(aircraft, "icao_type"),
      aircraftDescription: value(aircraft, "type"),
      operator: value(aircraft, "registered_owner"),
      manufacturer: value(aircraft, "manufacturer"),
      source: this.name,
      retrievedAt: new Date().toISOString(),
    };
  }

  async getRoute(callsign: string, observedAt: Date): Promise<FlightRoute | null> {
    const payload = await fetchAdsbDb<AdsbDbResponse>(this.baseUrl, `/callsign/${encodeURIComponent(callsign.trim().toLowerCase())}`);
    const response = payload?.response;
    if (!response || typeof response === "string") return null;
    const route = response.flightroute;
    if (!route) return null;
    const airline = nested(route, "airline");
    const originAirport = airport(nested(route, "origin"));
    const destinationAirport = airport(nested(route, "destination"));
    return {
      callsign: value(route, "callsign") ?? callsign.trim().toUpperCase(),
      airline: value(airline ?? undefined, "name"),
      airlineIcao: value(airline ?? undefined, "icao_code", "icao"),
      airlineIata: value(airline ?? undefined, "iata_code", "iata"),
      origin: originAirport?.icaoCode ?? null,
      destination: destinationAirport?.icaoCode ?? null,
      originAirport,
      destinationAirport,
      source: this.name,
      retrievedAt: observedAt.toISOString(),
    };
  }
}

