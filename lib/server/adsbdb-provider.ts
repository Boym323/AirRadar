import type { AircraftMetadata, FlightRoute } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import {
  defaultAirportResolver,
  normalizeAirportIata,
  normalizeAirportIcao,
  type AirportProviderMetadata,
  type AirportResolverLike,
} from "@/lib/server/airport-resolver";
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

interface ResolvedRouteAirport {
  airport: Airport | null;
  routeCode: string | null;
}

function airportMetadata(record: Record<string, unknown> | null): AirportProviderMetadata | null {
  if (!record) return null;
  return {
    icaoCode: value(record, "icao_code", "icao", "icaoCode"),
    iataCode: value(record, "iata_code", "iata", "iataCode"),
    name: value(record, "name"),
    city: value(record, "municipality", "city"),
    country: value(record, "country_name", "country"),
    latitude: numberValue(record, "latitude"),
    longitude: numberValue(record, "longitude"),
  };
}

async function airport(record: Record<string, unknown> | null, resolver: AirportResolverLike): Promise<ResolvedRouteAirport> {
  const metadata = airportMetadata(record);
  const icaoCode = normalizeAirportIcao(metadata?.icaoCode);
  const iataCode = normalizeAirportIata(metadata?.iataCode);
  if (!metadata || (!icaoCode && !iataCode)) return { airport: null, routeCode: null };

  let resolved: Airport | null = null;
  try {
    resolved = await resolver.resolve({ icaoCode, iataCode, providerAirport: metadata });
  } catch {
    // A resolver implementation is an optional enrichment dependency.
  }
  return {
    airport: resolved,
    routeCode: resolved?.icaoCode ?? icaoCode ?? iataCode,
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
  private providerStatus: "online" | "degraded" | "offline" = "offline";
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly baseUrl = "https://api.adsbdb.com/v0",
    private readonly airportResolver: AirportResolverLike = defaultAirportResolver,
  ) {}

  async getMetadata(icaoHex: string): Promise<AircraftMetadata | null> {
    let payload: AdsbDbResponse | null;
    try {
      payload = await fetchAdsbDb<AdsbDbResponse>(this.baseUrl, `/aircraft/${encodeURIComponent(icaoHex.toLowerCase())}`);
      this.recordSuccess();
    } catch (error) {
      this.recordFailure();
      throw error;
    }
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
    let payload: AdsbDbResponse | null;
    try {
      payload = await fetchAdsbDb<AdsbDbResponse>(this.baseUrl, `/callsign/${encodeURIComponent(callsign.trim().toLowerCase())}`);
      this.recordSuccess();
    } catch (error) {
      this.recordFailure();
      throw error;
    }
    const response = payload?.response;
    if (!response || typeof response === "string") return null;
    const route = response.flightroute;
    if (!route) return null;
    const airline = nested(route, "airline");
    const origin = await airport(nested(route, "origin"), this.airportResolver);
    const destination = await airport(nested(route, "destination"), this.airportResolver);
    return {
      callsign: value(route, "callsign") ?? callsign.trim().toUpperCase(),
      airline: value(airline ?? undefined, "name"),
      airlineIcao: value(airline ?? undefined, "icao_code", "icao"),
      airlineIata: value(airline ?? undefined, "iata_code", "iata"),
      origin: origin.routeCode,
      destination: destination.routeCode,
      originAirport: origin.airport,
      destinationAirport: destination.airport,
      source: this.name,
      retrievedAt: observedAt.toISOString(),
    };
  }

  getAdsbDbDiagnostics() {
    return {
      providerStatus: this.providerStatus,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      consecutiveFailures: this.consecutiveFailures,
    } as const;
  }

  private recordSuccess(): void {
    const recovered = this.providerStatus === "degraded" || this.providerStatus === "offline";
    this.providerStatus = "online";
    this.lastSuccessAt = new Date().toISOString();
    this.consecutiveFailures = 0;
    if (recovered && this.lastFailureAt) console.info("[adsbdb] provider recovered");
  }

  private recordFailure(): void {
    const wasOnline = this.providerStatus === "online";
    this.providerStatus = this.lastSuccessAt ? "degraded" : "offline";
    this.lastFailureAt = new Date().toISOString();
    this.consecutiveFailures += 1;
    if (wasOnline || this.consecutiveFailures === 1) console.warn("[adsbdb] provider unavailable");
  }
}
