import type { PredictionSample, PredictiveFlightState } from "./types";

export const PREDICTIVE_CALIBRATION_VERSION = "predictive-intelligence-v1-calibration-1" as const;
export const CALIBRATION_SPLIT_SEED = PREDICTIVE_CALIBRATION_VERSION;

export type CalibrationPartition = "CALIBRATION" | "HOLDOUT";
export type EtaExclusionReason =
  | "NO_DESTINATION"
  | "NO_GROUND_TRUTH"
  | "INSUFFICIENT_HISTORY"
  | "RECEIVER_GAP"
  | "INVALID_TIMELINE"
  | "PREDICTION_UNAVAILABLE"
  | "OTHER";

export interface HistoricalSourceValue<T> {
  value: T;
  /** The first instant at which this value was available to the predictor. */
  availableAt: number;
  /** The source event/observation instant, which may differ from availability. */
  eventAt: number | null;
}

export interface CalibrationFlight {
  flightId: number | string;
  instanceKey?: string | null;
  samples: readonly PredictionSample[];
  destination?: HistoricalSourceValue<string | null> | null;
  arrivalAt?: number | null;
  landingRunway?: string | null;
  events?: readonly { type: string; occurredAt: number; availableAt?: number }[];
}

export interface CalibrationMetric {
  n: number;
  median: number | null;
  meanAbsoluteError: number | null;
  p90: number | null;
  signedMeanError: number | null;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Stable, platform-independent FNV-1a hash for corpus membership decisions. */
export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function partitionForFlight(flightId: number | string, seed = CALIBRATION_SPLIT_SEED): CalibrationPartition {
  return stableHash(`${flightId}:${seed}`) % 10 < 7 ? "CALIBRATION" : "HOLDOUT";
}

export function splitCorpus<T extends { flightId: number | string }>(flights: readonly T[], seed = CALIBRATION_SPLIT_SEED) {
  const calibration: T[] = [];
  const holdout: T[] = [];
  for (const flight of flights) (partitionForFlight(flight.flightId, seed) === "CALIBRATION" ? calibration : holdout).push(flight);
  return { calibration, holdout, seed, algorithm: "stableHash(flightId + ':' + seed) % 10 < 7" as const };
}

export function assertDisjoint<T extends { flightId: number | string }>(calibration: readonly T[], holdout: readonly T[]): void {
  const ids = new Set(calibration.map((flight) => String(flight.flightId)));
  const overlap = holdout.filter((flight) => ids.has(String(flight.flightId))).map((flight) => String(flight.flightId));
  if (overlap.length) throw new Error(`Calibration/holdout overlap: ${overlap.join(",")}`);
}

export function samplesAtOrBefore(samples: readonly PredictionSample[], at: number): PredictionSample[] {
  return samples.filter((sample) => sample.observedAt <= at).sort((a, b) => a.observedAt - b.observedAt);
}

export function latestPredictionAtOrBefore(predictions: readonly PredictiveFlightState[], at: number): PredictiveFlightState | null {
  return predictions.filter((prediction) => prediction.evaluatedAt <= at).sort((a, b) => b.evaluatedAt - a.evaluatedAt)[0] ?? null;
}

export function simpleEtaBaseline(samples: readonly PredictionSample[], destination: { lat: number; lon: number }, at: number, distanceNm: (a: PredictionSample, b: { lat: number; lon: number }) => number): number | null {
  const visible = samplesAtOrBefore(samples, at);
  const current = visible.at(-1);
  if (!current) return null;
  const speed = current.groundSpeedKt;
  if (!finite(speed) || speed <= 40 || speed > 650) return null;
  const distance = distanceNm(current, destination);
  if (!finite(distance) || distance < 0) return null;
  return at + Math.max(60, Math.min(4 * 3600, distance / speed * 3600)) * 1000;
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? null;
}

export function summarizeEtaErrors(errorsMs: readonly number[], signedErrorsMs = errorsMs): CalibrationMetric {
  const absoluteMinutes = errorsMs.filter(finite).map((value) => Math.abs(value) / 60_000);
  const signedMinutes = signedErrorsMs.filter(finite).map((value) => value / 60_000);
  return {
    n: absoluteMinutes.length,
    median: percentile(absoluteMinutes, 0.5),
    meanAbsoluteError: absoluteMinutes.length ? absoluteMinutes.reduce((sum, value) => sum + value, 0) / absoluteMinutes.length : null,
    p90: percentile(absoluteMinutes, 0.9),
    signedMeanError: signedMinutes.length ? signedMinutes.reduce((sum, value) => sum + value, 0) / signedMinutes.length : null,
  };
}

export interface FutureMutationCase<T> {
  name: string;
  mutate: (input: T) => T;
}

/**
 * Release-blocking contract: changing only values unavailable at T must not
 * alter a prediction evaluated at T. The caller supplies a deep-equality
 * compatible prediction result; this keeps the check independent of storage.
 */
export function assertFutureMutationInvariant<TInput, TResult>(
  input: TInput,
  evaluate: (input: TInput) => TResult,
  mutations: readonly FutureMutationCase<TInput>[],
): void {
  const expected = evaluate(input);
  for (const mutation of mutations) {
    const actual = evaluate(mutation.mutate(input));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`No-look-ahead violation: ${mutation.name}`);
  }
}
