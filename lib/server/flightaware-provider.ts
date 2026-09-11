import type { FlightPlan } from "@/lib/aircraft/types";
import type { FlightPlanProvider } from "@/lib/server/provider";

export const FLIGHTAWARE_MAX_REQUESTS_PER_MINUTE = 5;
export const FLIGHTAWARE_MAX_REQUESTS_PER_HOUR = 30;
export const FLIGHTAWARE_MAX_REQUESTS_PER_DAY = 100;
const FLIGHTAWARE_MINUTE_WINDOW_MS = 60_000;
const FLIGHTAWARE_HOUR_WINDOW_MS = 60 * 60_000;
const FLIGHTAWARE_DAY_WINDOW_MS = 24 * 60 * 60_000;

export interface FlightAwareDiagnostics {
  requests: number;
  failures: number;
  rateLimited: number;
  limitPerMinute: number;
  limitPerHour: number;
  limitPerDay: number;
  windowMs: number;
  hourWindowMs: number;
  dayWindowMs: number;
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
type FlightAwareBudgetWindow = "minute" | "hour" | "day";

interface FlightAwareBudgetOptions {
  maxRequestsPerMinute?: number;
  maxRequestsPerHour?: number;
  maxRequestsPerDay?: number;
}

class SlidingWindowRequestBudget {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly limits: { minute: number; hour: number; day: number },
  ) {}

  tryTake(now = Date.now()): FlightAwareBudgetWindow | null {
    while (this.timestamps.length && this.timestamps[0] <= now - FLIGHTAWARE_DAY_WINDOW_MS) this.timestamps.shift();

    let minuteCount = 0;
    let hourCount = 0;
    for (const timestamp of this.timestamps) {
      if (timestamp > now - FLIGHTAWARE_HOUR_WINDOW_MS) hourCount += 1;
      if (timestamp > now - FLIGHTAWARE_MINUTE_WINDOW_MS) minuteCount += 1;
    }

    if (minuteCount >= this.limits.minute) return "minute";
    if (hourCount >= this.limits.hour) return "hour";
    if (this.timestamps.length >= this.limits.day) return "day";

    this.timestamps.push(now);
    return null;
  }
}

class FlightAwareRateLimitError extends Error {
  constructor(window: FlightAwareBudgetWindow | "upstream" = "minute") {
    super(window === "upstream"
      ? "FlightAware upstream rate limit reached"
      : `FlightAware local ${window} request budget exhausted`);
    this.name = "FlightAwareRateLimitError";
  }
}

function boundedLimit(value: number | undefined, fallback: number, absoluteMaximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(absoluteMaximum, Math.max(1, Math.trunc(value!)));
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
  private readonly limitPerMinute: number;
  private readonly limitPerHour: number;
  private readonly limitPerDay: number;
  private requests = 0;
  private failures = 0;
  private rateLimited = 0;

  constructor(
    private readonly apiKey: string,
    options: FlightAwareBudgetOptions = {},
  ) {
    this.limitPerMinute = boundedLimit(options.maxRequestsPerMinute, FLIGHTAWARE_MAX_REQUESTS_PER_MINUTE, 30);
    this.limitPerHour = boundedLimit(options.maxRequestsPerHour, FLIGHTAWARE_MAX_REQUESTS_PER_HOUR, 300);
    this.limitPerDay = boundedLimit(options.maxRequestsPerDay, FLIGHTAWARE_MAX_REQUESTS_PER_DAY, 1_000);
    this.budget = new SlidingWindowRequestBudget({
      minute: this.limitPerMinute,
      hour: this.limitPerHour,
      day: this.limitPerDay,
    });
  }

  getDiagnostics(): FlightAwareDiagnostics {
    return {
      requests: this.requests,
      failures: this.failures,
      rateLimited: this.rateLimited,
      limitPerMinute: this.limitPerMinute,
      limitPerHour: this.limitPerHour,
      limitPerDay: this.limitPerDay,
      windowMs: FLIGHTAWARE_MINUTE_WINDOW_MS,
      hourWindowMs: FLIGHTAWARE_HOUR_WINDOW_MS,
      dayWindowMs: FLIGHTAWARE_DAY_WINDOW_MS,
    };
  }

  private async request(url: string): Promise<Response> {
    const exhaustedWindow = this.budget.tryTake();
    if (exhaustedWindow) {
      this.rateLimited += 1;
      throw new FlightAwareRateLimitError(exhaustedWindow);
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
      if (response.status === 429) {
        this.rateLimited += 1;
        throw new FlightAwareRateLimitError("upstream");
      }
      if (!response.ok && response.status !== 404) this.failures += 1;
      return response;
    } catch (error) {
      if (!(error instanceof FlightAwareRateLimitError)) this.failures += 1;
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
      // An unavailable fallback route must not turn an incomplete result into a
      // six-hour positive cache entry. Bubble the error so the on-demand cache
      // can fail soft without caching the provider failure.
      if (error instanceof FlightAwareRateLimitError) throw error;
      const message = error instanceof Error ? error.message : "Unknown route lookup error";
      console.warn(`FlightAware route enrichment unavailable for ${faFlightId}: ${message}`);
      throw error;
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

    const filedRoute = stringValue(flight.route);
    const faFlightId = stringValue(flight.fa_flight_id);
    // The ident response already carries the filed route in normal cases. A
    // second paid /route call is therefore reserved strictly for the fallback
    // case where the filed route is absent.
    const waypoints = !filedRoute && faFlightId ? await this.readRoute(faFlightId) : [];
    if (!filedRoute && waypoints.length === 0) return null;

    return {
      callsign: stringValue(flight.ident) ?? callsign.trim().toUpperCase(),
      scheduledDeparture: stringValue(flight.scheduled_out),
      actualDeparture: stringValue(flight.actual_out),
      scheduledArrival: stringValue(flight.scheduled_in),
      estimatedArrival: stringValue(flight.estimated_in),
      filedRoute,
      waypoints,
      source: this.name,
      retrievedAt: observedAt.toISOString(),
    };
  }
}
