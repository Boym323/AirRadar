import type { Aircraft } from "@/lib/aircraft/types";
import { normalizeRunwayDesignator } from "@/lib/route-intelligence/contracts";

export const TERMINAL_EVIDENCE_VERSION = "terminal-evidence-v1" as const;
export const MAX_TERMINAL_TRACK_OBSERVATIONS = 16;
export const MAX_TERMINAL_TRACK_AGE_MS = 90_000;
export const MAX_TERMINAL_EVIDENCE_BYTES = 16_384;

export interface LandingGroundObservation {
  observedAt: string;
  onGround: true;
  lat: number | null;
  lon: number | null;
  altitudeFt: number | null;
  baroAltitudeFt: number | null;
  geomAltitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  baroRateFpm: number | null;
  geomRateFpm: number | null;
  seenSeconds: number | null;
  seenPosSeconds: number | null;
  source: string | null;
  origin: string | null;
}

export type TerminalTrackObservation = Omit<LandingGroundObservation, "onGround"> & { onGround: boolean };

export interface ReportedArrivalRunway {
  runway: string;
  provider: "FLIGHTAWARE";
  retrievedAt: string | null;
}

export interface LandingTerminalEvidenceV1 {
  version: typeof TERMINAL_EVIDENCE_VERSION;
  detection: TerminalTrackObservation;
  recentTrack: TerminalTrackObservation[];
  groundConfirmation: LandingGroundObservation | null;
  reportedArrivalRunway: ReportedArrivalRunway | null;
  destinationObservation: { destination: string; observedAt: string; source: string | null; providerRetrievedAt: string | null } | null;
}

function value(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function terminalObservation(aircraft: Aircraft, observedAt = aircraft.lastSeen): TerminalTrackObservation {
  return {
    observedAt,
    onGround: aircraft.onGround === true,
    lat: value(aircraft.lat), lon: value(aircraft.lon), altitudeFt: value(aircraft.altitude),
    baroAltitudeFt: value(aircraft.baroAltitude), geomAltitudeFt: value(aircraft.geomAltitude),
    groundSpeedKt: value(aircraft.groundSpeed), trackDeg: value(aircraft.track),
    verticalRateFpm: value(aircraft.verticalRate), baroRateFpm: value(aircraft.baroRate), geomRateFpm: value(aircraft.geomRate),
    seenSeconds: value(aircraft.seenSeconds), seenPosSeconds: value(aircraft.seenPosSeconds),
    source: aircraft.source ?? null, origin: aircraft.origin ?? null,
  };
}

export function reportedArrivalRunway(aircraft: Aircraft): ReportedArrivalRunway | null {
  const runway = normalizeRunwayDesignator(aircraft.enrichment?.flightPlan?.flightAware?.operational?.arrivalRunway);
  if (!runway) return null;
  return { runway, provider: "FLIGHTAWARE", retrievedAt: aircraft.enrichment?.flightPlan?.retrievedAt ?? null };
}

export function boundedTerminalTrack(history: readonly { aircraft: Aircraft; observedAt: number }[], at: number): TerminalTrackObservation[] {
  return history
    .filter((item) => at - item.observedAt >= 0 && at - item.observedAt <= MAX_TERMINAL_TRACK_AGE_MS)
    .slice(-MAX_TERMINAL_TRACK_OBSERVATIONS)
    .map((item) => terminalObservation(item.aircraft, new Date(item.observedAt).toISOString()));
}

export function terminalEvidenceFor(aircraft: Aircraft, history: readonly { aircraft: Aircraft; observedAt: number }[], at: number): LandingTerminalEvidenceV1 {
  const detection = terminalObservation(aircraft, new Date(at).toISOString());
  return {
    version: TERMINAL_EVIDENCE_VERSION,
    detection,
    recentTrack: boundedTerminalTrack(history, at),
    groundConfirmation: aircraft.onGround ? { ...detection, onGround: true } : null,
    reportedArrivalRunway: reportedArrivalRunway(aircraft),
    destinationObservation: null,
  };
}
