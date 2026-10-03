import type { PredictiveCapability } from "./graduation";

export type GroundTruthStatus = "CONFIRMED" | "AMBIGUOUS" | "UNKNOWN";
export type ScoreStatus = "SCORED" | "UNSCORABLE";

export interface EtaValidationResult {
  status: ScoreStatus;
  truthStatus: GroundTruthStatus;
  signedErrorSeconds: number | null;
  absoluteErrorSeconds: number | null;
}

export function scoreEta(predictedLandingAt: number | null, actualLandingAt: number | null, truthStatus: GroundTruthStatus): EtaValidationResult {
  if (truthStatus !== "CONFIRMED" || predictedLandingAt === null || actualLandingAt === null) return { status: "UNSCORABLE", truthStatus, signedErrorSeconds: null, absoluteErrorSeconds: null };
  const signedErrorSeconds = (predictedLandingAt - actualLandingAt) / 1000;
  return { status: "SCORED", truthStatus, signedErrorSeconds, absoluteErrorSeconds: Math.abs(signedErrorSeconds) };
}

export interface RunwayValidationResult {
  status: ScoreStatus;
  truthStatus: GroundTruthStatus;
  exactEnd: boolean | null;
  physicalRunway: boolean | null;
}

function runwayNumber(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase().replace(/^RWY\s*/, "") ?? "";
  const match = normalized.match(/^(\d{1,2})[LCR]?$/);
  return match ? match[1]!.padStart(2, "0") : null;
}

export function scoreRunway(predicted: string | null, actual: string | null, truthStatus: GroundTruthStatus): RunwayValidationResult {
  if (truthStatus !== "CONFIRMED" || actual === null) return { status: "UNSCORABLE", truthStatus, exactEnd: null, physicalRunway: null };
  if (predicted === null) return { status: "SCORED", truthStatus, exactEnd: false, physicalRunway: false };
  const predictedNumber = runwayNumber(predicted);
  const actualNumber = runwayNumber(actual);
  const exactEnd = predicted.trim().toUpperCase() === actual.trim().toUpperCase();
  const physicalRunway = predictedNumber !== null && actualNumber !== null && (predictedNumber === actualNumber || ((Number(predictedNumber) + 18) % 36 || 36) === Number(actualNumber) || ((Number(actualNumber) + 18) % 36 || 36) === Number(predictedNumber));
  return { status: "SCORED", truthStatus, exactEnd, physicalRunway };
}

export interface ValidationObservationLike {
  capability: PredictiveCapability;
  horizonBucket: string;
  predictionConfidence: string;
  eta?: EtaValidationResult;
  runway?: RunwayValidationResult;
}

export interface ValidationReportSummary {
  sampleCount: number;
  scoredFlights: number;
  unscorableFlights: number;
  maeSeconds: number | null;
  medianAbsoluteErrorSeconds: number | null;
  p75AbsoluteErrorSeconds: number | null;
  p90AbsoluteErrorSeconds: number | null;
  p95AbsoluteErrorSeconds: number | null;
  biasSeconds: number | null;
  earlyPercent: number | null;
  latePercent: number | null;
}

function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
}

export function summarizeEta(results: readonly EtaValidationResult[]): ValidationReportSummary {
  const scored = results.filter((result) => result.status === "SCORED" && result.signedErrorSeconds !== null && result.absoluteErrorSeconds !== null);
  const absolute = scored.map((result) => result.absoluteErrorSeconds!);
  const signed = scored.map((result) => result.signedErrorSeconds!);
  return {
    sampleCount: results.length,
    scoredFlights: scored.length,
    unscorableFlights: results.length - scored.length,
    maeSeconds: absolute.length ? absolute.reduce((sum, value) => sum + value, 0) / absolute.length : null,
    medianAbsoluteErrorSeconds: percentile(absolute, .5), p75AbsoluteErrorSeconds: percentile(absolute, .75),
    p90AbsoluteErrorSeconds: percentile(absolute, .9), p95AbsoluteErrorSeconds: percentile(absolute, .95),
    biasSeconds: signed.length ? signed.reduce((sum, value) => sum + value, 0) / signed.length : null,
    earlyPercent: scored.length ? signed.filter((value) => value < 0).length / scored.length * 100 : null,
    latePercent: scored.length ? signed.filter((value) => value > 0).length / scored.length * 100 : null,
  };
}

export function readiness(sampleCount: number, minimumFlights: number, minimumObservations: number): "INSUFFICIENT_DATA" | "NOT_READY" | "CANDIDATE" {
  if (sampleCount < minimumObservations) return "INSUFFICIENT_DATA";
  return sampleCount >= minimumFlights ? "CANDIDATE" : "NOT_READY";
}
