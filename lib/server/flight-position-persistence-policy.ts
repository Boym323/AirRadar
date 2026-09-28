/**
 * Pure, allocation-light policy primitives for FlightPosition replay/shadow
 * evaluation. This module deliberately has no database or airport-catalogue
 * dependency, so it can run on the hot path without a lookup per observation.
 */

export type FlightPersistenceSkipReason =
  | "first-observation"
  | "heartbeat-not-due"
  | "movement-below-threshold"
  | "stable-cruise"
  | "airport-fidelity"
  | "heading-change"
  | "altitude-change"
  | "vertical-state-change"
  | "source-transition"
  | "air-ground-transition"
  | "observation-gap";

export interface PersistedFlightPositionSample {
  recordedAtMs: number;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  trackDeg: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  onGround: boolean | null;
  source: string | null;
}

export interface FlightPositionCandidate extends PersistedFlightPositionSample {
  airportProximity: boolean;
  phase: "unknown" | "cruise" | "climb" | "descent" | "approach" | "airport";
}

export interface FlightPositionPolicyContext {
  heartbeatMs: number;
  minimumMovementM: number;
  meaningfulAltitudeFt: number;
  meaningfulHeadingDeg: number;
  meaningfulVerticalRateFpm: number;
  observationGapMs: number;
}

export interface FlightPositionPolicyDecision {
  persist: boolean;
  reason: FlightPersistenceSkipReason;
  elapsedMs: number | null;
  movementM: number | null;
}

export const DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT: FlightPositionPolicyContext = {
  heartbeatMs: 120_000,
  minimumMovementM: 1_000,
  meaningfulAltitudeFt: 300,
  meaningfulHeadingDeg: 12,
  meaningfulVerticalRateFpm: 500,
  observationGapMs: 90_000,
};

function valid(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function angleDelta(a: number | null, b: number | null): number | null {
  if (!valid(a) || !valid(b)) return null;
  const delta = Math.abs((a - b) % 360);
  return Math.min(delta, 360 - delta);
}

function distanceM(a: PersistedFlightPositionSample, b: PersistedFlightPositionSample): number {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function verticalState(sample: PersistedFlightPositionSample): "ground" | "climb" | "descent" | "level" | "unknown" {
  if (sample.onGround === true) return "ground";
  if (!valid(sample.verticalRateFpm)) return "unknown";
  if (sample.verticalRateFpm >= 250) return "climb";
  if (sample.verticalRateFpm <= -250) return "descent";
  return "level";
}

/** Decide whether a candidate should be persisted after the last persisted point. */
export function shouldPersistFlightPosition(
  previousPersisted: PersistedFlightPositionSample | null,
  candidate: FlightPositionCandidate,
  context: FlightPositionPolicyContext = DEFAULT_FLIGHT_POSITION_POLICY_CONTEXT,
): FlightPositionPolicyDecision {
  if (!previousPersisted) return { persist: true, reason: "first-observation", elapsedMs: null, movementM: null };

  const elapsedMs = Math.max(0, candidate.recordedAtMs - previousPersisted.recordedAtMs);
  const movementM = distanceM(previousPersisted, candidate);
  if (elapsedMs >= context.heartbeatMs) return { persist: true, reason: "heartbeat-not-due", elapsedMs, movementM };
  if (elapsedMs >= context.observationGapMs) return { persist: true, reason: "observation-gap", elapsedMs, movementM };
  if (candidate.airportProximity || candidate.phase === "approach" || candidate.phase === "airport") return { persist: true, reason: "airport-fidelity", elapsedMs, movementM };
  if (candidate.source !== previousPersisted.source) return { persist: true, reason: "source-transition", elapsedMs, movementM };
  if (candidate.onGround !== previousPersisted.onGround) return { persist: true, reason: "air-ground-transition", elapsedMs, movementM };
  if ((angleDelta(candidate.trackDeg, previousPersisted.trackDeg) ?? 0) >= context.meaningfulHeadingDeg) return { persist: true, reason: "heading-change", elapsedMs, movementM };
  if (valid(candidate.altitudeFt) && valid(previousPersisted.altitudeFt) && Math.abs(candidate.altitudeFt - previousPersisted.altitudeFt) >= context.meaningfulAltitudeFt) return { persist: true, reason: "altitude-change", elapsedMs, movementM };
  if (verticalState(candidate) !== verticalState(previousPersisted)) return { persist: true, reason: "vertical-state-change", elapsedMs, movementM };
  if (movementM >= context.minimumMovementM) return { persist: true, reason: "movement-below-threshold", elapsedMs, movementM };
  return { persist: false, reason: candidate.phase === "cruise" ? "stable-cruise" : "movement-below-threshold", elapsedMs, movementM };
}

export function makeFlightPositionPolicySample(candidate: FlightPositionCandidate): PersistedFlightPositionSample {
  return {
    recordedAtMs: candidate.recordedAtMs,
    lat: candidate.lat,
    lon: candidate.lon,
    altitudeFt: candidate.altitudeFt,
    trackDeg: candidate.trackDeg,
    groundSpeedKt: candidate.groundSpeedKt,
    verticalRateFpm: candidate.verticalRateFpm,
    onGround: candidate.onGround,
    source: candidate.source,
  };
}
