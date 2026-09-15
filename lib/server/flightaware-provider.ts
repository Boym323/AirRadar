import type { FlightAwareFlightStatus, FlightPlan } from "@/lib/aircraft/types";
import type { FlightPlanProvider } from "@/lib/server/provider";
import { FlightAwareUsageLedger, FLIGHTAWARE_COST_POLICY, type FlightAwareEndpointClass } from "@/lib/server/flightaware-usage";

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
  ledgerHealthy: boolean; ledgerState: string; estimatedResultSetsToday: number; estimatedResultSetsMonth: number; estimatedCostTodayUsd: number; estimatedCostMonthUsd: number; budgetBlocked: number; providerState: string; lastRequestAt: string | null; lastSuccessfulRequestAt: string | null; lastFailureAt: string | null;
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
  maxCostUsdPerDay?: number;
  maxCostUsdPerMonth?: number;
  ledgerPath?: string;
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

function numberValue(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function booleanValue(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }
const SCHEDULE_FIELDS = ["scheduled_out", "estimated_out", "actual_out", "scheduled_off", "estimated_off", "actual_off", "scheduled_on", "estimated_on", "actual_on", "scheduled_in", "estimated_in", "actual_in"] as const;

function statusFromFlight(flight: FlightAwareFlight): FlightAwareFlightStatus {
  const status: FlightAwareFlightStatus = {};
  const strings: Array<[keyof FlightAwareFlightStatus, unknown]> = [["ident", flight.ident], ["identIcao", flight.ident_icao], ["identIata", flight.ident_iata], ["faFlightId", flight.fa_flight_id], ["flightNumber", flight.flight_number], ["atcIdent", flight.atc_ident], ["type", flight.type], ["operator", flight.operator], ["operatorIcao", flight.operator_icao], ["operatorIata", flight.operator_iata], ["registration", flight.registration], ["aircraftType", flight.aircraft_type], ["inboundFaFlightId", flight.inbound_fa_flight_id], ["status", flight.status]];
  for (const [key, value] of strings) { const parsed = stringValue(value); if (parsed) (status[key] as string) = parsed; }
  for (const [key, value] of [["cancelled", flight.cancelled], ["diverted", flight.diverted], ["blocked", flight.blocked], ["positionOnly", flight.position_only]] as const) { const parsed = booleanValue(value); if (parsed !== null) (status[key] as boolean) = parsed; }
  const progress = numberValue(flight.progress_percent); if (progress !== null) status.progressPercent = progress;
  const schedule: Record<string, string> = {}; for (const key of SCHEDULE_FIELDS) { const parsed = stringValue(flight[key]); if (parsed) schedule[key] = parsed; } if (Object.keys(schedule).length) status.schedule = schedule;
  for (const [key, value] of [["filedEteSeconds", flight.filed_ete], ["filedAirspeed", flight.filed_airspeed], ["filedAltitude", flight.filed_altitude], ["routeDistance", flight.route_distance]] as const) { const parsed = numberValue(value); if (parsed !== null) (status[key] as number) = parsed; }
  for (const [key, value] of [["departureDelaySeconds", flight.departure_delay], ["arrivalDelaySeconds", flight.arrival_delay]] as const) { const parsed = numberValue(value); if (parsed !== null) status[key] = parsed; }
  const operational: Record<string, string> = {};
  for (const [key, value] of [["originTerminal", flight.origin_terminal], ["originGate", flight.origin_gate], ["departureRunway", flight.actual_departure_runway], ["destinationTerminal", flight.destination_terminal], ["destinationGate", flight.destination_gate], ["baggageClaim", flight.baggage_claim], ["arrivalRunway", flight.actual_arrival_runway]] as const) { const parsed = stringValue(value); if (parsed) operational[key] = parsed; }
  if (Object.keys(operational).length) status.operational = operational;
  if (Array.isArray(flight.codeshares)) status.codeshares = flight.codeshares.map(stringValue).filter((v): v is string => v !== null);
  if (Array.isArray(flight.codeshares_iata)) status.codesharesIata = flight.codeshares_iata.map(stringValue).filter((v): v is string => v !== null);
  if (flight.origin && typeof flight.origin === "object") status.origin = flight.origin as Record<string, unknown>;
  if (flight.destination && typeof flight.destination === "object") status.destination = flight.destination as Record<string, unknown>;
  return status;
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
  private readonly ledger: FlightAwareUsageLedger;
  private readonly maxCostDay: number | null;
  private readonly maxCostMonth: number | null;
  private reservedCost = 0;
  private budgetBlocked = 0;
  private providerState = "ready";
  private lastRequestAt: string | null = null;
  private lastSuccessfulRequestAt: string | null = null;
  private lastFailureAt: string | null = null;

  constructor(
    private readonly apiKey: string,
    options: FlightAwareBudgetOptions = {},
  ) {
    this.ledger = new FlightAwareUsageLedger(options.ledgerPath);
    this.limitPerMinute = boundedLimit(options.maxRequestsPerMinute, FLIGHTAWARE_MAX_REQUESTS_PER_MINUTE, 30);
    this.limitPerHour = boundedLimit(options.maxRequestsPerHour, FLIGHTAWARE_MAX_REQUESTS_PER_HOUR, 300);
    this.limitPerDay = boundedLimit(options.maxRequestsPerDay, FLIGHTAWARE_MAX_REQUESTS_PER_DAY, 1_000);
    this.budget = new SlidingWindowRequestBudget({
      minute: this.limitPerMinute,
      hour: this.limitPerHour,
      day: this.limitPerDay,
    });
    this.maxCostDay = options.maxCostUsdPerDay && options.maxCostUsdPerDay > 0 ? options.maxCostUsdPerDay : null;
    this.maxCostMonth = options.maxCostUsdPerMonth && options.maxCostUsdPerMonth > 0 ? options.maxCostUsdPerMonth : null;
  }

  getDiagnostics(): FlightAwareDiagnostics {
    const now = Date.now(); const today = this.ledger.entriesSince(now - 86_400_000); const month = this.ledger.entriesSince(now - 31 * 86_400_000);
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
      ledgerHealthy: this.ledger.isHealthy(), ledgerState: this.ledger.state(), estimatedResultSetsToday: today.reduce((s, e) => s + e.resultSetsEstimated, 0), estimatedResultSetsMonth: month.reduce((s, e) => s + e.resultSetsEstimated, 0), estimatedCostTodayUsd: today.reduce((s, e) => s + e.estimatedCostUsd, 0), estimatedCostMonthUsd: month.reduce((s, e) => s + e.estimatedCostUsd, 0), budgetBlocked: this.budgetBlocked, providerState: this.providerState, lastRequestAt: this.lastRequestAt, lastSuccessfulRequestAt: this.lastSuccessfulRequestAt, lastFailureAt: this.lastFailureAt,
    };
  }

  getReservationCostForTest(): number { return this.reservedCost; }

  private async request(url: string): Promise<Response> {
    const endpointClass: FlightAwareEndpointClass = url.endsWith("/route") ? "route" : "flight";
    const cost = FLIGHTAWARE_COST_POLICY[endpointClass];
    const now = Date.now();
    if (!this.ledger.isHealthy()) { this.providerState = "ledger-error"; this.budgetBlocked += 1; throw new FlightAwareRateLimitError("day"); }
    if (this.maxCostDay !== null && this.ledger.sum(now - 86_400_000) + this.reservedCost + cost.usdPerResultSet > this.maxCostDay) { this.providerState = "daily-cost-limit"; this.budgetBlocked += 1; throw new FlightAwareRateLimitError("day"); }
    if (this.maxCostMonth !== null && this.ledger.sum(now - 31 * 86_400_000) + this.reservedCost + cost.usdPerResultSet > this.maxCostMonth) { this.providerState = "monthly-cost-limit"; this.budgetBlocked += 1; throw new FlightAwareRateLimitError("day"); }
    const exhaustedWindow = this.budget.tryTake();
    if (exhaustedWindow) {
      this.rateLimited += 1;
      this.providerState = `${exhaustedWindow}-limit`;
      throw new FlightAwareRateLimitError(exhaustedWindow);
    }
    this.reservedCost += cost.usdPerResultSet;

    this.requests += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "x-apikey": this.apiKey, Accept: "application/json" },
      });
      this.ledger.append({ timestamp: new Date().toISOString(), endpointClass, requestCount: 1, resultSetsEstimated: 1, estimatedCostUsd: cost.usdPerResultSet, success: response.ok, httpStatusCategory: `${Math.floor(response.status / 100)}xx` });
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
      this.reservedCost = Math.max(0, this.reservedCost - cost.usdPerResultSet);
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
    const flightAware = statusFromFlight(flight);

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
      ...(Object.keys(flightAware).length ? { flightAware } : {}),
    };
  }
}
