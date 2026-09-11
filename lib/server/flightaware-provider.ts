import type { FlightPlan } from "@/lib/aircraft/types";
import type { FlightPlanProvider } from "@/lib/server/provider";

export const FLIGHTAWARE_MAX_REQUESTS_PER_MINUTE = 5;
const FLIGHTAWARE_RATE_WINDOW_MS = 60_000;

export interface FlightAwareDiagnostics {
  requests: number;
  failures: number;
  rateLimited: number;
  limitPerMinute: number;
  windowMs: number;
}

export interface FlightAwareFlight extends Record<string, unknown> {
  ident?: unknown;
  fa_flight_id?: unknown;
  scheduled_out?: unknown;
  estimated_out?: unknown;
  actual_out?: unknown;
  scheduled_off?: unknown;
  estimated_off?: unknown;
  actual_off?: unknown;
  scheduled_on?: unknown;
  estimated_on?: unknown;
  actual_on?: unknown;
  scheduled_in?: unknown;
  estimated_in?: unknown;
  actual_in?: unknown;
  route?: unknown;
}

interface FlightAwareResponse { flights?: FlightAwareFlight[] }
interface FlightAwareRouteFix { name?: unknown }
interface FlightAwareRouteResponse { fixes?: FlightAwareRouteFix[] }

class SlidingWindowRequestBudget {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  tryTake(now = Date.now()): boolean {
    while (this.timestamps.length && this.timestamps[0] <= now - this.windowMs) this.timestamps.shift();
    if (this.timestamps.length >= this.limit) return false;
    this.timestamps.push(now);
    return true;
  }
}

class FlightAwareRateLimitError extends Error {
  constructor() {
    super("FlightAware local request budget exhausted");
    this.name = "FlightAwareRateLimitError";
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timeValue(value: unknown): number | null {
  const text = stringValue(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function endpoint(callsign: string): string {
  const url = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(callsign.trim().toUpperCase())}`);
  // AeroAPI bills paginated endpoints per result set. One page is enough to
  // select the live/relevant instance and gives the cost guard a hard bound.
  url.searchParams.set("max_pages", "1");
  return url.toString();
}

function routeEndpoint(faFlightId: string): string {
  return `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(faFlightId)}/route`;
}

function flightTimes(flight: FlightAwareFlight): { departure: number[]; arrival: number[] } {
  const departure = [
    flight.scheduled_out,
    flight.estimated_out,
    flight.actual_out,
    flight.scheduled_off,
    flight.estimated_off,
    flight.actual_off,
  ].map(timeValue).filter((value): value is number => value !== null);
  const arrival = [
    flight.scheduled_in,
    flight.estimated_in,
    flight.actual_in,
    flight.scheduled_on,
    flight.estimated_on,
    flight.actual_on,
  ].map(timeValue).filter((value): value is number => value !== null);
  return { departure, arrival };
}

/** AeroAPI returns recent and scheduled ident instances, not one guaranteed flight. */
export function selectFlightInstance(flights: FlightAwareFlight[], observedAt: Date): FlightAwareFlight | null {
  const observed = observedAt.getTime();
  if (!Number.isFinite(observed)) return null;

  return flights
    .map((flight, index) => {
      const { departure, arrival } = flightTimes(flight);
      const start = departure.length ? Math.min(...departure) : null;
      const end = arrival.length ? Math.max(...arrival) : null;
      const distance = start !== null && end !== null && observed >= start && observed <= end
        ? 0
        : start !== null && end === null && observed >= start
          ? 0
          : start === null && end !== null && observed <= end
            ? 0
            : start !== null && observed < start
              ? start - observed
              : end !== null && observed > end
                ? observed - end
                : Number.POSITIVE_INFINITY;
      const scheduledDeparture = timeValue(flight.scheduled_out) ?? timeValue(flight.scheduled_off);
      return {
        flight,
        index,
        hasTimes: departure.length > 0 || arrival.length > 0,
        distance,
        scheduledDistance: scheduledDeparture === null ? Number.POSITIVE_INFINITY : Math.abs(scheduledDeparture - observed),
      };
    })
    .filter((candidate) => candidate.hasTimes)
    .sort((a, b) => a.distance - b.distance || a.scheduledDistance - b.scheduledDistance || a.index - b.index)[0]?.flight ?? null;
}

export class FlightAwareFlightPlanProvider implements FlightPlanProvider {
  readonly name = "flightaware-aeroapi";
  private readonly budget: SlidingWindowRequestBudget;
  private requests = 0;
  private failures = 0;
  private rateLimited = 0;

  constructor(
    private readonly apiKey: string,
    options: { maxRequestsPerMinute?: number } = {},
  ) {
    const configuredLimit = options.maxRequestsPerMinute ?? FLIGHTAWARE_MAX_REQUESTS_PER_MINUTE;
    const limit = Number.isFinite(configuredLimit)
      ? Math.min(30, Math.max(1, Math.trunc(configuredLimit)))
      : FLIGHTAWARE_MAX_REQUESTS_PER_MINUTE;
    this.budget = new SlidingWindowRequestBudget(limit, FLIGHTAWARE_RATE_WINDOW_MS);
  }

  getDiagnostics(): FlightAwareDiagnostics {
    return {
      requests: this.requests,
      failures: this.failures,
      rateLimited: this.rateLimited,
      limitPerMinute: this.budgetLimit(),
      windowMs: FLIGHTAWARE_RATE_WINDOW_MS,
    };
  }

  private budgetLimit(): number {
    // The budget intentionally keeps its timestamps private; the configured
    // limit is stable for this provider instance and exposed without secrets.
    return (this.budget as unknown as { limit: number }).limit;
  }

  private async request(url: string): Promise<Response> {
    if (!this.budget.tryTake()) {
      this.rateLimited += 1;
      throw new FlightAwareRateLimitError();
    }

    this.requests += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "x-apikey": this.apiKey, Accept: "application/json" },
      });
      if (response.status === 429) this.rateLimited += 1;
      if (!response.ok && response.status !== 404) this.failures += 1;
      return response;
    } catch (error) {
      this.failures += 1;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readRoute(faFlightId: string): Promise<string[]> {
    try {
      const response = await this.request(routeEndpoint(faFlightId));
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`FlightAware route returned HTTP ${response.status}`);
      const payload = await response.json() as FlightAwareRouteResponse;
      return Array.isArray(payload.fixes)
        ? payload.fixes.map((fix) => stringValue(fix.name)).filter((name): name is string => name !== null)
        : [];
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown route lookup error";
      console.warn(`FlightAware route enrichment unavailable for ${faFlightId}: ${message}`);
      return [];
    }
  }

  async getFlightPlan(callsign: string, observedAt: Date): Promise<FlightPlan | null> {
    if (!this.apiKey.trim()) return null;
    const response = await this.request(endpoint(callsign));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`FlightAware returned HTTP ${response.status}`);
    const payload = await response.json() as FlightAwareResponse;
    const flight = selectFlightInstance(payload.flights ?? [], observedAt);
    if (!flight) return null;
    const faFlightId = stringValue(flight.fa_flight_id);
    return {
      callsign: stringValue(flight.ident) ?? callsign.trim().toUpperCase(),
      scheduledDeparture: stringValue(flight.scheduled_out),
      actualDeparture: stringValue(flight.actual_out),
      scheduledArrival: stringValue(flight.scheduled_in),
      estimatedArrival: stringValue(flight.estimated_in),
      filedRoute: stringValue(flight.route),
      // Waypoints are fetched only when this provider is explicitly invoked.
      // Background aircraft polling no longer invokes FlightAware at all.
      waypoints: faFlightId ? await this.readRoute(faFlightId) : [],
      source: this.name,
      retrievedAt: observedAt.toISOString(),
    };
  }
}
