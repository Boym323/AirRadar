import { calculateRunwayWind } from "@/lib/airport-runway-wind";
import { haversineDistanceKm, initialBearing, distanceToGreatCircleSegmentKm } from "@/lib/geo";
import type { FlightPhase } from "@/lib/intelligence/types";
import {
  PREDICTIVE_INTELLIGENCE_VERSION, RUNWAY_CHANGE_EVENT_WINDOW_MS, type PredictionConfidence, type PredictionEvidence,
  type PredictionRunway, type PredictiveInput, type PredictiveFlightState, type PredictionSample,
} from "./types";
import { PREDICTIVE_CALIBRATION_CONFIG } from "./config";

const NM_PER_KM = 0.5399568;
const MIN_SAMPLE_WINDOW_MS = PREDICTIVE_CALIBRATION_CONFIG.eta.minimumProgressWindowMs;
const MAX_SAMPLE_AGE_MS = PREDICTIVE_CALIBRATION_CONFIG.eta.maxSampleAgeMs;
const angularDifference = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const confidence = (score: number): PredictionConfidence => score >= 0.78 ? "HIGH" : score >= 0.52 ? "MEDIUM" : score > 0 ? "LOW" : "UNKNOWN";
const phase = (value: FlightPhase): string => value === "FINAL" || value === "LANDING" ? "APPROACH" : value;
const isHolding = (value: FlightPhase): boolean => String(value) === "HOLDING" || String(value) === "HOLD";
function epochMilliseconds(value: number, field: string): number {
  const normalized = Math.round(value);
  if (!Number.isSafeInteger(normalized)) throw new RangeError(`${field} must be a safe epoch-millisecond integer`);
  return normalized;
}
function validSample(sample: PredictionSample, now: number): boolean {
  return sample.observedAt <= now && now - sample.observedAt <= MAX_SAMPLE_AGE_MS && Math.abs(sample.lat) <= 90 && Math.abs(sample.lon) <= 180;
}
function runwayEnds(runways: readonly PredictionRunway[]) {
  return runways.flatMap((runway) => [
    runway.leIdent && finite(runway.leLatitude) && finite(runway.leLongitude) && finite(runway.leHeadingDegT) ? { ident: runway.leIdent, lat: runway.leLatitude, lon: runway.leLongitude, heading: runway.leHeadingDegT } : null,
    runway.heIdent && finite(runway.heLatitude) && finite(runway.heLongitude) && finite(runway.heHeadingDegT) ? { ident: runway.heIdent, lat: runway.heLatitude, lon: runway.heLongitude, heading: runway.heHeadingDegT } : null,
  ].filter((value): value is { ident: string; lat: number; lon: number; heading: number } => value !== null && runway.closed !== true));
}
function distanceNm(input: PredictiveInput): number | null {
  const state = input.flightState;
  if (!input.destinationAirport || !finite(state.sample.lat) || !finite(state.sample.lon)) return null;
  return finite(state.distanceToDestinationNm) ? Math.max(0, state.distanceToDestinationNm) : haversineDistanceKm(state.sample.lat, state.sample.lon, input.destinationAirport.lat, input.destinationAirport.lon) * NM_PER_KM;
}
function recentProgress(input: PredictiveInput, valid: readonly PredictionSample[], currentDistanceNm: number): { rateKt: number | null; durationSec: number | null } {
  const first = valid[0]; const last = valid.at(-1);
  if (!first || !last || last.observedAt - first.observedAt < MIN_SAMPLE_WINDOW_MS || !input.destinationAirport) return { rateKt: null, durationSec: null };
  const firstDistance = haversineDistanceKm(first.lat, first.lon, input.destinationAirport.lat, input.destinationAirport.lon) * NM_PER_KM;
  const durationSec = (last.observedAt - first.observedAt) / 1000;
  const rateKt = (firstDistance - currentDistanceNm) / (durationSec / 3600);
  return { rateKt: rateKt > 15 && rateKt < PREDICTIVE_CALIBRATION_CONFIG.eta.maximumSpeedKt ? rateKt : null, durationSec };
}
function eta(input: PredictiveInput, valid: readonly PredictionSample[]): PredictiveFlightState["eta"] {
  const distance = distanceNm(input);
  if (distance === null || input.flightState.destinationStatus === "UNKNOWN" || distance < 0.3 || valid.length < 2) return { estimatedArrivalAt: null, confidence: "UNKNOWN", evidence: [] };
  const current = input.flightState.sample.groundSpeedKt;
  const progress = recentProgress(input, valid, distance);
  const speed = progress.rateKt ?? (finite(current) && current > PREDICTIVE_CALIBRATION_CONFIG.eta.minimumSpeedKt ? current : null);
  if (speed === null) return { estimatedArrivalAt: null, confidence: "UNKNOWN", evidence: [{ key: "reason", value: "insufficient motion context" }] };
  const correction = phase(input.flightState.phase) === "APPROACH" ? 0.92 : input.flightState.phase === "DESCENT" ? 0.88 : isHolding(input.flightState.phase) ? 0.7 : 1;
  const seconds = Math.min(4 * 3600, Math.max(60, distance / (speed * correction) * 3600));
  let score = progress.rateKt !== null ? 0.76 : 0.48;
  if (isHolding(input.flightState.phase) || input.flightState.phase === "GO_AROUND") score -= 0.2;
  if (valid.at(-1)!.observedAt - valid[0]!.observedAt >= 5 * 60_000) score += 0.08;
  return { estimatedArrivalAt: epochMilliseconds(input.now + seconds * 1000, "estimatedArrivalAt"), confidence: confidence(score), evidence: [
    { key: "distanceRemainingNm", value: Math.round(distance * 10) / 10 }, { key: "effectiveSpeedKt", value: Math.round(speed) },
    { key: "phase", value: phase(input.flightState.phase) }, ...(progress.durationSec ? [{ key: "progressWindowSec", value: Math.round(progress.durationSec) }] : []),
  ] };
}
function runway(input: PredictiveInput, valid: readonly PredictionSample[]): PredictiveFlightState["runway"] {
  if (!input.destinationAirport || input.flightState.destinationStatus === "UNKNOWN") return { runway: null, alternative: null, changedFrom: null, changedAt: null, confidence: "UNKNOWN", changed: false, evidence: [] };
  const candidates = runwayEnds(input.runways ?? []);
  if (!candidates.length) return { runway: null, alternative: null, changedFrom: null, changedAt: null, confidence: "UNKNOWN", changed: false, evidence: [{ key: "reason", value: "no runway geometry" }] };
  const last = valid.at(-1) ?? input.flightState.sample;
  const destinationBearing = initialBearing(last.lat, last.lon, input.destinationAirport.lat, input.destinationAirport.lon);
  const usage = new Map((input.airportOperations?.runwayUsage ?? []).map((item) => [item.designator, item]));
  const scores = candidates.map((candidate) => {
    const wind = input.weather && !input.weather.stale ? calculateRunwayWind(candidate.heading, input.weather.windDirectionDeg, input.weather.windSpeedKt) : null;
    const alignment = finite(last.trackDeg) ? Math.max(0, 1 - angularDifference(last.trackDeg, candidate.heading) / 90) : 0;
    const flow = usage.get(candidate.ident); const flowScore = flow ? Math.min(1, flow.arrivals / Math.max(3, flow.total)) : 0;
    const windScore = wind ? Math.max(0, Math.min(1, (wind.headwindKt + 20) / 60)) : 0;
    const near = haversineDistanceKm(last.lat, last.lon, candidate.lat, candidate.lon) < 35;
    const approach = near ? alignment * 0.35 : Math.max(0, 1 - angularDifference(destinationBearing, candidate.heading) / 100) * 0.1;
    return { ident: candidate.ident, score: flowScore * 0.4 + windScore * 0.25 + approach + (flow ? 0.15 : 0) };
  }).sort((a, b) => b.score - a.score || a.ident.localeCompare(b.ident, undefined, { numeric: true }));
  const best = scores[0]!; const second = scores[1]; const margin = second ? best.score - second.score : best.score;
  const c = confidence((best.score >= 0.72 ? 0.72 : best.score) + (margin >= 0.15 ? 0.12 : 0));
  const previousRunway = input.previousPrediction?.runway;
  const previous = previousRunway?.runway;
  const immediateChange = Boolean(previous && previous !== best.ident && c !== "LOW" && c !== "UNKNOWN" && margin >= 0.15);
  const carriedChange = Boolean(
    !immediateChange
    && previousRunway?.changed
    && previousRunway.runway === best.ident
    && previousRunway.changedFrom
    && previousRunway.changedAt
    && input.now - previousRunway.changedAt <= RUNWAY_CHANGE_EVENT_WINDOW_MS
  );
  const changed = immediateChange || carriedChange;
  const changedFrom = immediateChange ? previous ?? null : carriedChange ? previousRunway?.changedFrom ?? null : null;
  const changedAt = immediateChange ? input.now : carriedChange ? previousRunway?.changedAt ?? null : null;
  return { runway: best.ident, alternative: second?.ident ?? null, changedFrom, changedAt, confidence: c, changed, evidence: [
    ...(usage.has(best.ident) ? [{ key: "recentRunwayUsage", value: String(usage.get(best.ident)!.total) }] : []),
    ...(input.weather && !input.weather.stale ? [{ key: "surfaceWind", value: `${input.weather.windDirectionDeg ?? "VRB"}/${input.weather.windSpeedKt ?? "?"}kt` }] : []),
    { key: "candidateMargin", value: Math.round(margin * 100) / 100 },
  ] };
}
function trajectory(input: PredictiveInput, valid: readonly PredictionSample[]): PredictiveFlightState["trajectory"] {
  if (!input.destinationAirport || valid.length < 3 || isHolding(input.flightState.phase) || input.flightState.phase === "GO_AROUND" || input.flightState.phase === "TAKEOFF" || input.flightState.phase === "GROUND") return { state: valid.length ? "NORMAL" : "UNKNOWN", confidence: valid.length ? "LOW" : "UNKNOWN", evidence: [] };
  const first = valid[0]!; const last = valid.at(-1)!;
  const crossTrackKm = distanceToGreatCircleSegmentKm(first.lat, first.lon, input.destinationAirport.lat, input.destinationAirport.lon, last.lat, last.lon);
  const expected = initialBearing(last.lat, last.lon, input.destinationAirport.lat, input.destinationAirport.lon);
  const headingAway = finite(last.trackDeg) && angularDifference(last.trackDeg, expected) > 110;
  const firstDistance = haversineDistanceKm(first.lat, first.lon, input.destinationAirport.lat, input.destinationAirport.lon);
  const lastDistance = haversineDistanceKm(last.lat, last.lon, input.destinationAirport.lat, input.destinationAirport.lon);
  const evidence: PredictionEvidence[] = [{ key: "crossTrackKm", value: Math.round(crossTrackKm * 10) / 10 }, { key: "distanceChangeKm", value: Math.round((lastDistance - firstDistance) * 10) / 10 }];
  if (crossTrackKm > PREDICTIVE_CALIBRATION_CONFIG.trajectory.deviationCrossTrackKm && headingAway && lastDistance > firstDistance + 5) return { state: "DEVIATING", confidence: "MEDIUM", evidence };
  if (crossTrackKm > PREDICTIVE_CALIBRATION_CONFIG.trajectory.possibleCrossTrackKm || headingAway || lastDistance > firstDistance + 2) return { state: "POSSIBLE_DEVIATION", confidence: "LOW", evidence };
  return { state: "NORMAL", confidence: "MEDIUM", evidence };
}
export function evaluatePredictiveIntelligence(input: PredictiveInput): { prediction: PredictiveFlightState; durationMs: number } {
  const started = performance.now();
  const valid = [...input.recentSamples].filter((sample) => validSample(sample, input.now)).sort((a, b) => a.observedAt - b.observedAt).slice(-24);
  const prediction = { modelVersion: PREDICTIVE_INTELLIGENCE_VERSION, evaluatedAt: epochMilliseconds(input.now, "evaluatedAt"), eta: eta(input, valid), runway: runway(input, valid), trajectory: trajectory(input, valid) };
  return { prediction, durationMs: Math.round((performance.now() - started) * 100) / 100 };
}
