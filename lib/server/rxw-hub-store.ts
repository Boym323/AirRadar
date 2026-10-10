import type { RxwCommunication, RxwReportedRoute, RxwRouteEvidence, RxwWaypointPlan, RxwWaypointAvailability } from "@/lib/aircraft/rxw-communications";
import { parseRxwH1Fpn } from "@/lib/server/rxw-fpn-parser";

/** Never retain raw message text, decoded ACARS/CPDLC content or operational conversations. */
export const RXW_MESSAGE_TTL_MS = 2 * 60 * 60_000;
export const RXW_ROUTE_HINT_TTL_MS = 45 * 60_000;
export const RXW_WAYPOINT_PLAN_TTL_MS = 45 * 60_000;
export const RXW_MAX_WAYPOINT_PLANS = 256;
export const RXW_MAX_AIRCRAFT = 512;
export const RXW_MAX_MESSAGES_PER_AIRCRAFT = 20;
export const RXW_MAX_SEEN_UIDS = 12_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function shortString(value: unknown, length: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > length || /[\x00-\x1f\x7f]/.test(trimmed)) return null;
  return trimmed;
}

/** Only an actual ICAO24 identity is safe to match; never infer one from callsign. */
export function rxwIcaoHex(raw: Record<string, unknown>): string | null {
  const hex = shortString(raw.icao_hex, 6);
  if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
  if (typeof raw.icao === "number" && Number.isInteger(raw.icao) && raw.icao >= 0 && raw.icao <= 0xffffff) {
    return raw.icao.toString(16).toUpperCase().padStart(6, "0");
  }
  const fallback = shortString(raw.icao, 6);
  return fallback && /^[0-9a-fA-F]{6}$/.test(fallback) ? fallback.toUpperCase() : null;
}

/** Recognize airport codes, never accept unknown/placeholder values as route evidence. */
export function rxwAirportCode(value: unknown): string | null {
  const code = shortString(value, 4)?.toUpperCase();
  if (!code || !/^[A-Z]{3,4}$/.test(code) || ["ZZZZ", "XXXX", "XXX", "UNK", "NIL", "NONE"].includes(code)) return null;
  return code;
}

export function rxwFlightIdentifier(value: unknown): string | null {
  const flight = shortString(value, 10)?.toUpperCase();
  return flight && /^[A-Z0-9]{2,10}$/.test(flight) ? flight : null;
}

/**
 * ACARS Hub's structured eta is commonly HHMM UTC. Preserve a UTC clock only:
 * no fabricated arrival day, timezone, schedule or flight-plan ETA.
 */
export function rxwEtaUtc(value: unknown): string | null {
  const raw = shortString(value, 8)?.toUpperCase();
  if (!raw) return null;
  const match = /^([01]\d|2[0-3]):?([0-5]\d)Z?$/.exec(raw);
  return match ? match[1] + ":" + match[2] + "Z" : null;
}

/** Only a complete pair in the *same* upstream message may form a route claim. */
export function parseRxwReportedRoute(raw: Record<string, unknown>): RxwReportedRoute | null {
  const origin = rxwAirportCode(raw.depa);
  const destination = rxwAirportCode(raw.dsta);
  if (!origin || !destination || origin === destination) return null;
  return { origin, destination, etaUtc: rxwEtaUtc(raw.eta), flight: rxwFlightIdentifier(raw.flight) };
}

export function normalizeRxwCommunication(value: unknown, now = Date.now()): RxwCommunication | null {
  const raw = record(value);
  if (!raw) return null;
  const icaoHex = rxwIcaoHex(raw);
  const uid = shortString(raw.uid, 128);
  const protocol = shortString(raw.message_type, 24);
  const stationId = shortString(raw.station_id, 64);
  if (!icaoHex || !uid || !protocol || !stationId) return null;

  const seconds = typeof raw.timestamp === "number" ? raw.timestamp : Number(raw.timestamp);
  const timestampMs = seconds > 1e12 ? seconds : seconds * 1000;
  if (!Number.isFinite(timestampMs) || timestampMs < now - RXW_MESSAGE_TTL_MS || timestampMs > now + 5 * 60_000) return null;

  const numericFreq = typeof raw.freq === "number" ? raw.freq : Number(raw.freq);
  const frequencyMhz = Number.isFinite(numericFreq) && numericFreq > 0 && numericFreq < 500
    ? Math.round(numericFreq * 10000) / 10000
    : null;

  return {
    uid,
    icaoHex,
    timestamp: new Date(timestampMs).toISOString(),
    protocol,
    stationId,
    frequencyMhz,
    label: shortString(raw.label, 16),
    reportedRoute: parseRxwReportedRoute(raw),
  };
}

/** A strictly secondary hint for the currently identified flight, never a verified route. */
export function selectRxwRouteEvidence(
  messages: readonly RxwCommunication[],
  icaoHex: string,
  callsign: string | null,
  now = Date.now(),
): RxwRouteEvidence | null {
  const flight = rxwFlightIdentifier(callsign);
  if (!flight || !/^[0-9A-F]{6}$/.test(icaoHex)) return null;
  const matched = messages
    .filter((message) => {
      const observedAt = Date.parse(message.timestamp);
      return message.icaoHex === icaoHex
        && message.reportedRoute?.flight === flight
        && Number.isFinite(observedAt)
        && observedAt <= now
        && observedAt >= now - RXW_ROUTE_HINT_TTL_MS;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
  if (!matched?.reportedRoute) return null;
  return {
    ...matched.reportedRoute,
    icaoHex,
    observedAt: matched.timestamp,
    stationId: matched.stationId,
    source: "rxw-acarshub",
    confidence: "reported",
  };
}

/** Process-local bounded metadata cache. Does not persist any ACARS text or raw messages. */
export class RxwHubMessageStore {
  private readonly aircraft = new Map<string, RxwCommunication[]>();
  private readonly seen = new Map<string, number>();
  private readonly waypointPlans = new Map<string, RxwWaypointPlan>();
  private accepted = 0;

  ingest(input: unknown, now = Date.now()): boolean {
    const message = normalizeRxwCommunication(input, now);
    if (!message) return false;
    const key = message.stationId + ":" + message.uid;
    if (this.seen.has(key)) return false;

    this.seen.set(key, now);
    while (this.seen.size > RXW_MAX_SEEN_UIDS) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }

    const previous = this.aircraft.get(message.icaoHex) ?? [];
    const updated = [message, ...previous.filter((item) => Date.parse(item.timestamp) >= now - RXW_MESSAGE_TTL_MS)]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, RXW_MAX_MESSAGES_PER_AIRCRAFT);
    this.aircraft.delete(message.icaoHex);
    this.aircraft.set(message.icaoHex, updated);
    while (this.aircraft.size > RXW_MAX_AIRCRAFT) {
      const oldest = this.aircraft.keys().next().value;
      if (oldest === undefined) break;
      this.aircraft.delete(oldest);
    }
    // Transiently decode only allowlisted H1/FPN format; the body never reaches
    // the public aircraft model, in-memory message cache, database or logs.
    if (process.env.RXW_FPN_ENABLED?.trim().toLowerCase() === "true") {
      const raw = input !== null && typeof input === "object" && !Array.isArray(input)
        ? input as Record<string, unknown> : null;
      if (raw?.label === "H1") {
        const parsed = parseRxwH1Fpn(raw.text, raw.flight);
        if (parsed) {
          const seenAt = Date.parse(message.timestamp);
          const previousPlan = this.waypointPlans.get(message.icaoHex);
          if (!previousPlan || Date.parse(previousPlan.observedAt) <= seenAt) {
            if (parsed.status === "inactive") {
              // A route-inactive report must not keep an older 'RP' badge alive.
              if (previousPlan?.flight === parsed.flight) this.waypointPlans.delete(message.icaoHex);
            } else if (seenAt >= now - RXW_WAYPOINT_PLAN_TTL_MS && seenAt <= now) {
              const plan: RxwWaypointPlan = {
                ...parsed,
                icaoHex: message.icaoHex,
                observedAt: message.timestamp,
                stationId: message.stationId,
                source: "rxw-acarshub",
                confidence: "reported",
              };
              this.waypointPlans.delete(message.icaoHex);
              this.waypointPlans.set(message.icaoHex, plan);
              while (this.waypointPlans.size > RXW_MAX_WAYPOINT_PLANS) {
                const oldest = this.waypointPlans.keys().next().value;
                if (!oldest) break;
                this.waypointPlans.delete(oldest);
              }
            }
          }
        }
      }
    }
    this.accepted += 1;
    return true;
  }

  list(icaoHex: string, now = Date.now()): RxwCommunication[] {
    if (!/^[0-9A-F]{6}$/.test(icaoHex)) return [];
    const list = this.aircraft.get(icaoHex) ?? [];
    const fresh = list.filter((item) => Date.parse(item.timestamp) >= now - RXW_MESSAGE_TTL_MS);
    if (fresh.length !== list.length) {
      if (fresh.length) this.aircraft.set(icaoHex, fresh);
      else this.aircraft.delete(icaoHex);
    }
    return fresh.slice();
  }

  routeForFlight(icaoHex: string, callsign: string | null, now = Date.now()): RxwRouteEvidence | null {
    return selectRxwRouteEvidence(this.list(icaoHex, now), icaoHex, callsign, now);
  }

  /** Keep the plan identity bound to its current flight; never infer by ICAO alone. */
  waypointPlanForFlight(icaoHex: string, callsign: string | null, now = Date.now()): RxwWaypointPlan | null {
    const flight = rxwFlightIdentifier(callsign);
    const plan = this.waypointPlans.get(icaoHex);
    if (!flight || !plan || plan.flight !== flight || plan.status !== "planned") return null;
    if (Date.parse(plan.observedAt) > now || Date.parse(plan.observedAt) < now - RXW_WAYPOINT_PLAN_TTL_MS) {
      if (Date.parse(plan.observedAt) < now - RXW_WAYPOINT_PLAN_TTL_MS) this.waypointPlans.delete(icaoHex);
      return null;
    }
    return { ...plan, waypoints: plan.waypoints.map((point) => ({ ...point })) };
  }

  /** Bounded, non-sensitive summary for radar indicators, not raw message text. */
  waypointAvailability(now = Date.now()): RxwWaypointAvailability[] {
    const available: RxwWaypointAvailability[] = [];
    for (const [hex, plan] of this.waypointPlans) {
      const timestamp = Date.parse(plan.observedAt);
      if (timestamp < now - RXW_WAYPOINT_PLAN_TTL_MS) {
        this.waypointPlans.delete(hex);
      } else if (timestamp <= now && plan.status === "planned") {
        available.push({ icaoHex: hex, flight: plan.flight, waypointCount: plan.waypoints.length });
      }
    }
    return available;
  }

  stats(): { aircraft: number; accepted: number; uids: number; plans: number } {
    return { aircraft: this.aircraft.size, accepted: this.accepted, uids: this.seen.size, plans: this.waypointPlans.size };
  }

  clear(): void {
    this.aircraft.clear();
    this.seen.clear();
    this.waypointPlans.clear();
    this.accepted = 0;
  }
}
