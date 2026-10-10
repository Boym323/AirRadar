import type { FlightRoute } from "@/lib/aircraft/types";
import {
  defaultAirportResolver,
  normalizeAirportIata,
  normalizeAirportIcao,
  type AirportResolverLike,
} from "@/lib/server/airport-resolver";
import type { FlightRouteProvider, RouteLookupPosition } from "@/lib/server/provider";
import { getRouteEnrichmentTelemetry } from "@/lib/server/route-enrichment-telemetry";

/** Independent of the ADSB.lol traffic provider; route lookups are opt-in. */
const ROUTESET_URL = "https://api.adsb.lol/api/0/routeset";
const MAX_BATCH_SIZE = 20;
const MAX_PENDING = 200;
const FLUSH_DELAY_MS = 200;
const MIN_REQUEST_GAP_MS = 1_500;
const ERROR_BACKOFF_MS = 30_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 3_500;

interface PendingLookup {
  callsign: string;
  latitude: number;
  longitude: number;
  observedAt: Date;
  resolve: (value: FlightRoute | null) => void;
  reject: (error: unknown) => void;
}

interface RouteSetAirport {
  icao?: unknown;
  iata?: unknown;
  name?: unknown;
  location?: unknown;
  countryiso2?: unknown;
  lat?: unknown;
  lon?: unknown;
}

interface RouteSetRow {
  callsign?: unknown;
  airport_codes?: unknown;
  _airports?: unknown;
  airline_code?: unknown;
  plausible?: unknown;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validPosition(position?: RouteLookupPosition): position is { lat: number; lon: number } {
  return !!position && typeof position.lat === "number" && Number.isFinite(position.lat)
    && position.lat >= -90 && position.lat <= 90
    && typeof position.lon === "number" && Number.isFinite(position.lon)
    && position.lon >= -180 && position.lon <= 180;
}

function normalizedCallsign(value: unknown): string | null {
  const callsign = stringValue(value)?.toUpperCase();
  return callsign && /^[A-Z0-9]{2,10}$/.test(callsign) ? callsign : null;
}

function coordinate(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function airportRecord(value: unknown): RouteSetAirport | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RouteSetAirport : null;
}

function routeRow(value: unknown): RouteSetRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RouteSetRow : null;
}

/**
 * Queues callsign lookups from one snapshot into bounded POST /routeset requests.
 * A failed batch rejects its callers, so upstream outages are NOT negative-cached.
 * Successful misses and implausible routes are negative-cached by EnrichmentService.
 */
export class AdsbLolRouteProvider implements FlightRouteProvider {
  readonly name = "adsblol-routeset";
  private readonly pending: PendingLookup[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private nextAllowedAt = 0;
  private requests = 0;
  private failures = 0;
  private rejected = 0;

  constructor(private readonly airportResolver: AirportResolverLike = defaultAirportResolver) {}

  getRoute(callsign: string, observedAt: Date, position?: RouteLookupPosition): Promise<FlightRoute | null> {
    const normalized = normalizedCallsign(callsign);
    if (!normalized || !validPosition(position)) return Promise.resolve(null);
    if (this.pending.length >= MAX_PENDING) {
      this.rejected += 1;
      return Promise.resolve(null);
    }

    return new Promise<FlightRoute | null>((resolve, reject) => {
      this.pending.push({ callsign: normalized, latitude: position.lat, longitude: position.lon, observedAt, resolve, reject });
      this.schedule();
    });
  }

  getDiagnostics() {
    return { requests: this.requests, failures: this.failures, pending: this.pending.length, rejected: this.rejected };
  }

  private schedule(): void {
    if (this.timer || this.processing || this.pending.length === 0) return;
    const delay = Math.max(FLUSH_DELAY_MS, this.nextAllowedAt - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
    this.timer.unref?.();
  }

  private async flush(): Promise<void> {
    if (this.processing) return;
    const batch = this.pending.splice(0, MAX_BATCH_SIZE);
    if (!batch.length) return;
    this.processing = true;
    this.nextAllowedAt = Date.now() + MIN_REQUEST_GAP_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      this.requests += 1;
      getRouteEnrichmentTelemetry().record("adsblolBatch");
      getRouteEnrichmentTelemetry().record("adsblolLookup", batch.length);
      const response = await fetch(ROUTESET_URL, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ planes: batch.map((lookup) => ({
          callsign: lookup.callsign,
          lat: lookup.latitude,
          lng: lookup.longitude,
        })) }),
      });
      if (!response.ok) throw new Error("ADSB.lol routeset HTTP " + response.status);
      const size = Number(response.headers.get("content-length"));
      if (Number.isFinite(size) && size > MAX_RESPONSE_BYTES) throw new Error("ADSB.lol routeset response too large");
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) throw new Error("ADSB.lol routeset response too large");
      const payload: unknown = JSON.parse(body);
      if (!Array.isArray(payload) || payload.length > MAX_BATCH_SIZE * 2) throw new Error("Invalid ADSB.lol routeset response");

      const rows = payload as unknown[];
      const callsignCounts = new Map<string, number>();
      for (const item of batch) callsignCounts.set(item.callsign, (callsignCounts.get(item.callsign) ?? 0) + 1);

      const results = await Promise.all(batch.map(async (lookup, index) => {
        const rowAtIndex = rows.length === batch.length ? rows[index] : null;
        const indexed = routeRow(rowAtIndex);
        const matchingIndex = normalizedCallsign(indexed?.callsign) === lookup.callsign ? indexed : null;
        // Non-positional response matching is safe only when callsign is unique.
        const row = matchingIndex ?? (callsignCounts.get(lookup.callsign) === 1
          ? rows.map(routeRow)
              .find((candidate) => normalizedCallsign(candidate?.callsign) === lookup.callsign)
          : null);
        return this.parseRoute(row ?? null, lookup);
      }));
      results.forEach((result, index) => batch[index].resolve(result));
    } catch (error) {
      this.failures += 1;
      getRouteEnrichmentTelemetry().record("adsblolError");
      this.nextAllowedAt = Math.max(this.nextAllowedAt, Date.now() + ERROR_BACKOFF_MS);
      batch.forEach((lookup) => lookup.reject(error));
    } finally {
      clearTimeout(timeout);
      this.processing = false;
      this.schedule();
    }
  }

  private async parseRoute(row: RouteSetRow | null, lookup: PendingLookup): Promise<FlightRoute | null> {
    if (!row || row.plausible !== true) return null;
    const codePair = stringValue(row.airport_codes)?.toUpperCase().split("-");
    const airports = Array.isArray(row._airports) ? row._airports : [];
    if (!codePair || codePair.length !== 2 || airports.length !== 2) return null;
    const originRaw = airportRecord(airports[0]);
    const destinationRaw = airportRecord(airports[1]);
    if (!originRaw || !destinationRaw) return null;
    const originIcao = normalizeAirportIcao(codePair[0]);
    const destinationIcao = normalizeAirportIcao(codePair[1]);
    if (!originIcao || !destinationIcao || originIcao === destinationIcao) return null;

    const resolve = (raw: RouteSetAirport, icaoCode: string) => this.airportResolver.resolve({
      icaoCode,
      iataCode: normalizeAirportIata(raw.iata),
      providerAirport: {
        icaoCode,
        iataCode: normalizeAirportIata(raw.iata),
        name: stringValue(raw.name),
        city: stringValue(raw.location),
        country: stringValue(raw.countryiso2),
        latitude: coordinate(raw.lat, -90, 90),
        longitude: coordinate(raw.lon, -180, 180),
      },
    });
    const [originAirport, destinationAirport] = await Promise.all([
      resolve(originRaw, originIcao),
      resolve(destinationRaw, destinationIcao),
    ]);
    // A complete, geocodable pair is required for independent corridor validation.
    if (!originAirport || !destinationAirport) return null;
    const airlineCode = stringValue(row.airline_code)?.toUpperCase() ?? null;
    return {
      callsign: lookup.callsign,
      airline: null,
      airlineIcao: airlineCode && /^[A-Z]{3}$/.test(airlineCode) ? airlineCode : null,
      airlineIata: null,
      origin: originIcao,
      destination: destinationIcao,
      originAirport,
      destinationAirport,
      source: this.name,
      retrievedAt: new Date().toISOString(),
    };
  }
}
