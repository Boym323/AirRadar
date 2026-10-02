import type { Aircraft } from "@/lib/aircraft/types";

/**
 * Typed, sparse alert primitives.  This module is deliberately independent of
 * Prisma and HTTP so the hot path can keep one immutable configuration snapshot
 * in memory and tests can exercise the transition rules without a live receiver.
 */
export const ALERT_V1_EVENT_TYPES = [
  "TAKEOFF", "INITIAL_CLIMB", "CRUISE_ENTER", "TOP_OF_DESCENT", "APPROACH",
  "LANDING", "HOLD_ENTER", "HOLD_EXIT", "GO_AROUND",
] as const;
export type AlertV1FlightEventType = (typeof ALERT_V1_EVENT_TYPES)[number];
export type AlertV1TriggerType = "FLIGHT_EVENT" | "SQUAWK" | "GEOFENCE_ENTER" | "GEOFENCE_EXIT";
export type AlertV1MatcherType = "ICAO_HEX" | "REGISTRATION" | "CALLSIGN_PREFIX";
export type AlertV1Target = { kind: "ALL_AIRCRAFT" } | { kind: "FLEET"; fleetId: string };

export interface AlertV1FleetMatcher {
  id: string;
  enabled: boolean;
  type: AlertV1MatcherType;
  value: string;
}

export interface AlertV1Fleet {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  matchers: AlertV1FleetMatcher[];
}

export interface AlertV1Geofence {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  enabled: boolean;
}

export interface AlertV1Rule {
  id: string;
  name: string;
  enabled: boolean;
  target: AlertV1Target;
  trigger: AlertV1TriggerType;
  flightEventTypes?: AlertV1FlightEventType[];
  squawks?: string[];
  geofenceId?: string;
  channels: Array<"IN_APP" | "PUSHOVER">;
  cooldownMs?: number;
}

export interface AlertV1Config {
  fleets: AlertV1Fleet[];
  geofences: AlertV1Geofence[];
  rules: AlertV1Rule[];
}

export interface AlertV1AircraftIdentity {
  icaoHex: string;
  registration: string | null;
  callsign: string | null;
}

export interface AlertV1Signal {
  sourceType: "FLIGHT_EVENT" | "SQUAWK" | "GEOFENCE";
  sourceKey: string;
  trigger: AlertV1TriggerType;
  aircraft: AlertV1AircraftIdentity;
  occurredAt: string;
  flightEventId?: string;
  flightEventType?: AlertV1FlightEventType;
  squawk?: string;
  geofenceId?: string;
  geofenceName?: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
}

export interface AlertV1Occurrence {
  id: string;
  ruleId: string;
  sourceType: AlertV1Signal["sourceType"];
  sourceKey: string;
  trigger: AlertV1TriggerType;
  aircraft: AlertV1AircraftIdentity;
  occurredAt: string;
  payload: Record<string, string | number | null>;
}

export const GEOFENCE_MIN_RADIUS_METERS = 100;
export const GEOFENCE_MAX_RADIUS_METERS = 500_000;
export const GEOFENCE_HYSTERESIS_METERS = 100;
export const GEOFENCE_CONFIRMATION_OBSERVATIONS = 2;

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function normalizeAlertV1Matcher(type: AlertV1MatcherType, value: string): string {
  const result = normalized(value);
  if (type === "ICAO_HEX") return result.replace(/^~/, "");
  return result;
}

export function matchesAlertV1Matcher(aircraft: AlertV1AircraftIdentity | Aircraft, matcher: AlertV1FleetMatcher): boolean {
  if (!matcher.enabled) return false;
  const value = normalizeAlertV1Matcher(matcher.type, matcher.value);
  if (matcher.type === "ICAO_HEX") return normalized(aircraft.icaoHex) === value;
  if (matcher.type === "REGISTRATION") return normalized(aircraft.registration) === value;
  return normalized(aircraft.callsign).startsWith(value);
}

export function matchingAlertV1Fleets(aircraft: AlertV1AircraftIdentity | Aircraft, fleets: readonly AlertV1Fleet[]): string[] {
  return fleets.filter((fleet) => fleet.enabled && fleet.matchers.some((matcher) => matchesAlertV1Matcher(aircraft, matcher))).map((fleet) => fleet.id);
}

export function ruleTargetMatches(rule: AlertV1Rule, aircraft: AlertV1AircraftIdentity | Aircraft, fleets: readonly AlertV1Fleet[]): boolean {
  return rule.target.kind === "ALL_AIRCRAFT" || matchingAlertV1Fleets(aircraft, fleets).includes(rule.target.fleetId);
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function geofenceInside(distanceMeters: number, radiusMeters: number, priorInside: boolean | null): boolean {
  if (priorInside === true) return distanceMeters <= radiusMeters + GEOFENCE_HYSTERESIS_METERS;
  if (priorInside === false) return distanceMeters < radiusMeters - GEOFENCE_HYSTERESIS_METERS;
  return distanceMeters <= radiusMeters;
}

export function occurrenceId(ruleId: string, sourceType: AlertV1Signal["sourceType"], sourceKey: string): string {
  return `alert-v1:${ruleId}:${sourceType}:${sourceKey}`;
}

export function signalMatchesRule(signal: AlertV1Signal, rule: AlertV1Rule, fleets: readonly AlertV1Fleet[]): boolean {
  if (!rule.enabled || !ruleTargetMatches(rule, signal.aircraft, fleets) || rule.trigger !== signal.trigger) return false;
  if (signal.trigger === "FLIGHT_EVENT") return Boolean(signal.flightEventType && rule.flightEventTypes?.includes(signal.flightEventType));
  if (signal.trigger === "SQUAWK") return Boolean(signal.squawk && rule.squawks?.includes(signal.squawk));
  return rule.geofenceId === signal.geofenceId;
}

export function evaluateAlertV1(signal: AlertV1Signal, config: AlertV1Config, alreadySeen: ReadonlySet<string> = new Set()): AlertV1Occurrence[] {
  return config.rules.filter((rule) => signalMatchesRule(signal, rule, config.fleets)).flatMap((rule) => {
    const id = occurrenceId(rule.id, signal.sourceType, signal.sourceKey);
    if (alreadySeen.has(id)) return [];
    return [{
      id, ruleId: rule.id, sourceType: signal.sourceType, sourceKey: signal.sourceKey,
      trigger: signal.trigger, aircraft: signal.aircraft, occurredAt: signal.occurredAt,
      payload: {
        icaoHex: signal.aircraft.icaoHex, registration: signal.aircraft.registration,
        callsign: signal.aircraft.callsign, flightEventType: signal.flightEventType ?? null,
        squawk: signal.squawk ?? null, geofenceId: signal.geofenceId ?? null,
        geofenceName: signal.geofenceName ?? null, latitude: signal.latitude ?? null,
        longitude: signal.longitude ?? null, distanceMeters: signal.distanceMeters ?? null,
      },
    }];
  });
}

/**
 * Episode keys are tied to the canonical observation timestamp, not to a
 * generated id. Repeated frames never reach this helper because the tracker
 * emits only confirmed transitions; a later transition has a different
 * observation timestamp and therefore a different episode key.
 */
export function squawkTransitionSourceKey(icaoHex: string, previous: string | null, current: string, observedAt: string): string {
  return `squawk:${normalized(icaoHex)}:${previous ?? "NON_SPECIAL"}->${current}:${observedAt}`;
}

export function geofenceTransitionSourceKey(icaoHex: string, geofenceId: string, transition: "ENTER" | "EXIT", observedAt: string): string {
  return `geofence:${normalized(icaoHex)}:${geofenceId}:${transition}:${observedAt}`;
}

export function validateAlertV1Geofence(input: Pick<AlertV1Geofence, "centerLat" | "centerLon" | "radiusMeters">): void {
  if (!Number.isFinite(input.centerLat) || input.centerLat < -90 || input.centerLat > 90) throw new Error("invalid geofence latitude");
  if (!Number.isFinite(input.centerLon) || input.centerLon < -180 || input.centerLon > 180) throw new Error("invalid geofence longitude");
  if (!Number.isFinite(input.radiusMeters) || input.radiusMeters < GEOFENCE_MIN_RADIUS_METERS || input.radiusMeters > GEOFENCE_MAX_RADIUS_METERS) throw new Error("invalid geofence radius");
}

export class AlertV1TransitionTracker {
  private readonly squawks = new Map<string, string | null>();
  private readonly geofences = new Map<string, boolean>();
  private readonly pending = new Map<string, { inside: boolean; count: number }>();
  private initialized = false;

  /** The first snapshot is a baseline: it can never emit startup alerts. */
  beginBaseline(): void { this.initialized = true; }

  observeSquawk(icaoHex: string, squawk: string | null): { previous: string | null; current: string | null } | null {
    const key = normalized(icaoHex);
    const current = squawk && /^(7500|7600|7700)$/.test(squawk.trim()) ? squawk.trim() : null;
    const previous = this.squawks.get(key);
    this.squawks.set(key, current);
    if (!this.initialized || previous === undefined || previous === current) return null;
    return { previous, current };
  }

  observeGeofence(aircraftHex: string, geofence: AlertV1Geofence, latitude: number | null, longitude: number | null): { transition: "ENTER" | "EXIT"; distanceMeters: number } | null {
    if (!geofence.enabled || latitude === null || longitude === null) return null;
    const distanceMeters = haversineMeters(geofence.centerLat, geofence.centerLon, latitude, longitude);
    const aircraftKey = `${normalized(aircraftHex)}:${geofence.id}`;
    const prior = this.geofences.get(aircraftKey) ?? null;
    const candidate = geofenceInside(distanceMeters, geofence.radiusMeters, prior);
    const pending = this.pending.get(aircraftKey);
    const next = pending?.inside === candidate ? { inside: candidate, count: pending.count + 1 } : { inside: candidate, count: 1 };
    this.pending.set(aircraftKey, next);
    if (next.count < GEOFENCE_CONFIRMATION_OBSERVATIONS) return null;
    this.pending.delete(aircraftKey);
    this.geofences.set(aircraftKey, candidate);
    if (!this.initialized || prior === null || prior === candidate) return null;
    return { transition: candidate ? "ENTER" : "EXIT", distanceMeters };
  }

  evict(activeAircraft: ReadonlySet<string>): void {
    for (const key of this.squawks.keys()) if (!activeAircraft.has(key)) this.squawks.delete(key);
    for (const key of this.geofences.keys()) if (!activeAircraft.has(key.split(":", 1)[0]!)) this.geofences.delete(key);
    for (const key of this.pending.keys()) if (!activeAircraft.has(key.split(":", 1)[0]!)) this.pending.delete(key);
  }

  diagnostics(): { squawkStateSize: number; geofenceStateSize: number; pendingStateSize: number } {
    return { squawkStateSize: this.squawks.size, geofenceStateSize: this.geofences.size, pendingStateSize: this.pending.size };
  }
}
