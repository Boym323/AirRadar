import type { AirportRunway } from "@/lib/airports/infrastructure";
import { haversineDistanceKm } from "@/lib/geo";
import type { Airport } from "@/lib/airports/types";

/**
 * Post-hoc observed terminal truth. This module intentionally has no imports
 * from the predictive engine, live state owner, or database.
 */
export const TERMINAL_GROUND_TRUTH_VERSION = "terminal-ground-truth-v1" as const;

export type TerminalStatus = "CONFIRMED" | "AMBIGUOUS" | "UNKNOWN";
export type RunwayStatus = "CONFIRMED" | "AMBIGUOUS" | "UNKNOWN";
export type TerminalConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface TerminalTrackSample {
  recordedAt: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  onGround?: boolean | null;
}

export interface TerminalGroundTruthInput {
  flightId?: number;
  positions: readonly TerminalTrackSample[];
  airports: readonly Airport[];
  runwaysByAirport?: ReadonlyMap<string, readonly AirportRunway[]>;
}

export interface ObservedRunwayResult {
  status: RunwayStatus;
  designator: string | null;
  candidates: Array<{ designator: string; score: number; lateralDistanceKm: number; thresholdDistanceKm: number }>;
  evidence: string[];
}

export interface TerminalGroundTruth {
  status: TerminalStatus;
  landingAt: string | null;
  airportIcao: string | null;
  runway: string | null;
  runwayStatus: RunwayStatus;
  confidence: TerminalConfidence;
  evidence: string[];
  terminalSamples: number;
  closestRunwayDistanceKm: number | null;
  samplingIntervalSeconds: { median: number | null; aroundLanding: number | null };
  uncertaintySeconds: number | null;
  observedRunway: ObservedRunwayResult;
  sourceVersion: typeof TERMINAL_GROUND_TRUTH_VERSION;
}

const MAX_TERMINAL_GAP_MS = 3 * 60_000;
const AIRPORT_ASSOCIATION_KM = 15;
const RUNWAY_ZONE_KM = 2.5;
const LOW_ALTITUDE_FT = 1_500;
const LOW_SPEED_KT = 120;

function finite(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
function timestamp(value: string): number { return Date.parse(value); }
function angleDelta(a: number | null, b: number | null): number | null {
  if (!finite(a) || !finite(b)) return null;
  return Math.abs(((a - b + 540) % 360) - 180);
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}
function validSample(sample: TerminalTrackSample): boolean {
  return finite(sample.lat) && finite(sample.lon) && sample.lat >= -90 && sample.lat <= 90 && sample.lon >= -180 && sample.lon <= 180 && Number.isFinite(timestamp(sample.recordedAt));
}
function relativeAltitude(sample: TerminalTrackSample, airport: Airport): number | null {
  return finite(sample.altitudeFt) ? sample.altitudeFt - (airport.elevationFt ?? 0) : null;
}
function runwayEnds(runway: AirportRunway): Array<{ designator: string; lat: number; lon: number; heading: number | null }> {
  return [
    runway.leIdent && finite(runway.leLatitude) && finite(runway.leLongitude) ? { designator: runway.leIdent, lat: runway.leLatitude, lon: runway.leLongitude, heading: runway.leHeadingDegT } : null,
    runway.heIdent && finite(runway.heLatitude) && finite(runway.heLongitude) ? { designator: runway.heIdent, lat: runway.heLatitude, lon: runway.heLongitude, heading: runway.heHeadingDegT } : null,
  ].filter((value): value is { designator: string; lat: number; lon: number; heading: number | null } => value !== null);
}
function localXY(lat: number, lon: number, originLat: number, originLon: number): { x: number; y: number } {
  const scale = 111.32;
  return { x: (lon - originLon) * scale * Math.cos(originLat * Math.PI / 180), y: (lat - originLat) * scale };
}

function observedRunway(samples: readonly TerminalTrackSample[], airport: Airport, runways: readonly AirportRunway[], landingIndex: number): ObservedRunwayResult {
  const ends = runways.filter((runway) => runway.closed !== true).flatMap(runwayEnds);
  if (!ends.length) return { status: "UNKNOWN", designator: null, candidates: [], evidence: ["runway geometry unavailable"] };
  const terminal = samples.slice(Math.max(0, landingIndex - 5), Math.min(samples.length, landingIndex + 3));
  const scored = ends.map((end) => {
    const distances = terminal.map((sample) => haversineDistanceKm(sample.lat, sample.lon, end.lat, end.lon));
    const lateral = terminal.map((sample) => {
      const point = localXY(sample.lat, sample.lon, end.lat, end.lon);
      const heading = (end.heading ?? 0) * Math.PI / 180;
      return Math.abs(point.x * Math.sin(heading) - point.y * Math.cos(heading));
    });
    const aligned = terminal.filter((sample) => angleDelta(sample.trackDeg, end.heading) !== null && angleDelta(sample.trackDeg, end.heading)! <= 30).length;
    const corridor = terminal.filter((_, index) => (lateral[index] ?? Number.POSITIVE_INFINITY) <= 0.35).length;
    const thresholdDistanceKm = Math.min(...distances);
    const lateralDistanceKm = Math.min(...lateral);
    const score = (thresholdDistanceKm <= RUNWAY_ZONE_KM ? 3 : 0) + (lateralDistanceKm <= 0.35 ? 3 : 0) + Math.min(2, corridor) + Math.min(2, aligned);
    return { designator: end.designator.trim().toUpperCase(), score, lateralDistanceKm, thresholdDistanceKm };
  }).sort((a, b) => b.score - a.score || a.thresholdDistanceKm - b.thresholdDistanceKm || a.designator.localeCompare(b.designator, undefined, { numeric: true }));
  const best = scored[0]!;
  const second = scored[1];
  const comparable = second && best.score - second.score < 2;
  if (best.score < 7 || best.thresholdDistanceKm > RUNWAY_ZONE_KM) return { status: "UNKNOWN", designator: null, candidates: scored.slice(0, 4), evidence: ["terminal trajectory did not establish a unique runway corridor"] };
  if (comparable) return { status: "AMBIGUOUS", designator: null, candidates: scored.slice(0, 4), evidence: ["multiple runway ends have comparable terminal geometry"] };
  return { status: "CONFIRMED", designator: best.designator, candidates: scored.slice(0, 4), evidence: ["terminal track aligned with runway heading", "multiple terminal samples occupied the centerline corridor", "terminal track reached the threshold zone"] };
}

export function classifyTerminalGroundTruth(input: TerminalGroundTruthInput): TerminalGroundTruth {
  const samples = input.positions.filter(validSample).sort((a, b) => timestamp(a.recordedAt) - timestamp(b.recordedAt));
  const intervals = samples.slice(1).map((sample, index) => (timestamp(sample.recordedAt) - timestamp(samples[index]!.recordedAt)) / 1000).filter((value) => value >= 0 && value <= 3_600);
  const base = (status: TerminalStatus, evidence: string[], confidence: TerminalConfidence): TerminalGroundTruth => ({ status, landingAt: null, airportIcao: null, runway: null, runwayStatus: "UNKNOWN", confidence, evidence, terminalSamples: 0, closestRunwayDistanceKm: null, samplingIntervalSeconds: { median: median(intervals), aroundLanding: null }, uncertaintySeconds: null, observedRunway: { status: "UNKNOWN", designator: null, candidates: [], evidence: [] }, sourceVersion: TERMINAL_GROUND_TRUTH_VERSION });
  if (samples.length < 5) return base("UNKNOWN", ["fewer than five valid historical samples"], "LOW");
  const endGapMs = timestamp(samples.at(-1)!.recordedAt) - timestamp(samples.at(-2)!.recordedAt);
  if (endGapMs > MAX_TERMINAL_GAP_MS) return base("AMBIGUOUS", ["track ended after a terminal coverage gap"], "LOW");

  const candidates = input.airports.map((airport) => {
    const distances = samples.map((sample) => haversineDistanceKm(sample.lat, sample.lon, airport.latitude, airport.longitude));
    const minDistanceKm = Math.min(...distances);
    const minIndex = distances.indexOf(minDistanceKm);
    const terminal = samples.slice(Math.max(0, minIndex - 5), Math.min(samples.length, minIndex + 5));
    const lowAltitude = terminal.filter((sample) => { const altitude = relativeAltitude(sample, airport); return altitude !== null && altitude <= LOW_ALTITUDE_FT; }).length;
    const lowSpeed = terminal.filter((sample) => finite(sample.groundSpeedKt) && sample.groundSpeedKt <= LOW_SPEED_KT).length;
    const descending = terminal.filter((sample) => finite(sample.verticalRateFpm) && sample.verticalRateFpm <= -150).length >= 2 || (relativeAltitude(terminal.at(-1)!, airport) ?? 99999) < (relativeAltitude(terminal[0]!, airport) ?? -99999) - 300;
    const endDistance = distances.at(-1)!;
    const beforeDistance = distances[Math.max(0, samples.length - Math.min(terminal.length + 3, samples.length))]!;
    const converging = beforeDistance - minDistanceKm >= 1;
    const score = (minDistanceKm <= AIRPORT_ASSOCIATION_KM ? 2 : 0) + (endDistance <= 8 ? 2 : 0) + (lowAltitude >= 2 ? 2 : 0) + (lowSpeed >= 2 ? 1 : 0) + (descending ? 2 : 0) + (converging ? 1 : 0);
    return { airport, distances, minDistanceKm, minIndex, terminal, lowAltitude, lowSpeed, descending, endDistance, score };
  }).sort((a, b) => b.score - a.score || a.minDistanceKm - b.minDistanceKm);
  const best = candidates[0]!;
  if (best.minDistanceKm > AIRPORT_ASSOCIATION_KM || best.score < 7) return base("UNKNOWN", ["no airport has sufficient independent terminal evidence"], "LOW");
  const second = candidates[1];
  if (second && second.score === best.score && second.minDistanceKm <= AIRPORT_ASSOCIATION_KM) return base("AMBIGUOUS", ["terminal geometry does not uniquely identify an airport"], "LOW");
  const runwayCandidates = input.runwaysByAirport?.get(best.airport.icaoCode.toUpperCase()) ?? [];
  const runway = observedRunway(samples, best.airport, runwayCandidates, best.minIndex);
  const exactGround = samples.find((sample, index) => sample.onGround === true && (index === 0 || samples[index - 1]?.onGround !== true));
  const touchdown = exactGround ?? samples.slice(best.minIndex).find((sample) => {
    const altitude = relativeAltitude(sample, best.airport);
    return best.distances[samples.indexOf(sample)]! <= RUNWAY_ZONE_KM && altitude !== null && altitude <= LOW_ALTITUDE_FT && (sample.groundSpeedKt === null || sample.groundSpeedKt <= LOW_SPEED_KT);
  });
  const touchdownIndex = touchdown ? samples.indexOf(touchdown) : -1;
  const landingAt = touchdown?.recordedAt ?? null;
  const aroundLanding = touchdownIndex > 0 ? (timestamp(samples[touchdownIndex]!.recordedAt) - timestamp(samples[touchdownIndex - 1]!.recordedAt)) / 1000 : null;
  const evidence = ["terminal distance decreased toward the airport", "terminal descent reached low altitude", "multiple low-altitude terminal samples were observed"];
  if (best.lowSpeed >= 2) evidence.push("terminal groundspeed was low or reduced");
  if (exactGround) evidence.push("exact historical on-ground transition was available");
  else if (touchdown) evidence.push("first low-altitude runway-zone sample followed by terminal continuation");
  else evidence.push("touchdown was not directly observed");
  const landingConfirmed = Boolean(touchdown) && best.endDistance <= 8 && best.terminal.length >= 3;
  const status: TerminalStatus = landingConfirmed ? "CONFIRMED" : "AMBIGUOUS";
  return {
    status,
    landingAt,
    airportIcao: best.airport.icaoCode.toUpperCase(),
    runway: runway.status === "CONFIRMED" ? runway.designator : null,
    runwayStatus: runway.status,
    confidence: exactGround && runway.status === "CONFIRMED" ? "HIGH" : landingConfirmed ? "MEDIUM" : "LOW",
    evidence,
    terminalSamples: best.terminal.length,
    closestRunwayDistanceKm: runway.candidates[0]?.thresholdDistanceKm ?? null,
    samplingIntervalSeconds: { median: median(intervals), aroundLanding },
    uncertaintySeconds: aroundLanding === null ? null : Math.max(aroundLanding, median(intervals) ?? aroundLanding),
    observedRunway: runway,
    sourceVersion: TERMINAL_GROUND_TRUTH_VERSION,
  };
}
