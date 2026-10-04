import type { PredictiveCapability } from "./graduation";
import {
  PREDICTIVE_READINESS_THRESHOLDS,
  type PredictiveReadinessCapabilityResult,
  type PredictiveReadinessEvaluation,
  type PredictiveReadinessEvidence,
} from "./readiness";

export const PREDICTIVE_GRADUATION_CALIBRATION_VERSION = "predictive-graduation-calibration-v1" as const;

export type PredictiveGraduationCalibrationPhase =
  | "READY"
  | "COLLECTING"
  | "TRUTH_BLOCKED"
  | "QUALITY_BLOCKED"
  | "HARD_BLOCKED"
  | "COLLECTION_BLOCKED";

export type PredictiveGraduationCalibrationUnit = "COUNT" | "SECONDS" | "RATE";

export interface PredictiveGraduationEvidenceDeficit {
  key: string;
  current: number;
  target: number;
  missing: number;
  unit: "COUNT";
}

export interface PredictiveGraduationQualityMargin {
  key: string;
  current: number | null;
  target: number;
  direction: "AT_LEAST" | "AT_MOST";
  margin: number | null;
  unit: PredictiveGraduationCalibrationUnit;
  satisfied: boolean | null;
}

export interface PredictiveGraduationTruthRequirement {
  key: string;
  available: boolean;
}

export interface PredictiveGraduationCapabilityCalibration {
  capability: PredictiveCapability;
  decision: PredictiveReadinessCapabilityResult<unknown>["decision"];
  phase: PredictiveGraduationCalibrationPhase;
  manualReviewEligible: boolean;
  qualityEvaluated: boolean;
  evidenceDeficits: PredictiveGraduationEvidenceDeficit[];
  truthRequirements: PredictiveGraduationTruthRequirement[];
  qualityMargins: PredictiveGraduationQualityMargin[];
  integrityBlockers: string[];
  collectionBlockers: string[];
  readinessReasons: string[];
}

export interface PredictiveGraduationCalibration {
  version: typeof PREDICTIVE_GRADUATION_CALIBRATION_VERSION;
  thresholdVersion: PredictiveReadinessEvaluation["thresholdVersion"];
  complete: boolean;
  capabilities: {
    ETA: PredictiveGraduationCapabilityCalibration;
    RUNWAY: PredictiveGraduationCapabilityCalibration;
    RUNWAY_CHANGE: PredictiveGraduationCapabilityCalibration;
    TRAJECTORY: PredictiveGraduationCapabilityCalibration;
  };
}

function deficit(key: string, current: number, target: number): PredictiveGraduationEvidenceDeficit | null {
  const missing = Math.max(0, target - current);
  return missing > 0 ? { key, current, target, missing, unit: "COUNT" } : null;
}

function atLeast(
  key: string,
  current: number | null,
  target: number,
  unit: PredictiveGraduationCalibrationUnit,
): PredictiveGraduationQualityMargin {
  const margin = current === null ? null : current - target;
  return {
    key,
    current,
    target,
    direction: "AT_LEAST",
    margin,
    unit,
    satisfied: margin === null ? null : margin >= 0,
  };
}

function atMost(
  key: string,
  current: number | null,
  target: number,
  unit: PredictiveGraduationCalibrationUnit,
): PredictiveGraduationQualityMargin {
  const margin = current === null ? null : target - current;
  return {
    key,
    current,
    target,
    direction: "AT_MOST",
    margin,
    unit,
    satisfied: margin === null ? null : margin >= 0,
  };
}

function classify(
  result: PredictiveReadinessCapabilityResult<unknown>,
  complete: boolean,
): PredictiveGraduationCalibrationPhase {
  if (!complete || result.reasons.includes("collection.bounded_result_incomplete")) return "COLLECTION_BLOCKED";
  if (result.reasons.some((reason) => reason.startsWith("integrity."))) return "HARD_BLOCKED";
  if (result.decision === "PASS") return "READY";
  if (result.decision === "FAIL") return "QUALITY_BLOCKED";
  if (result.reasons.some((reason) =>
    reason.includes("truth_unavailable")
    || reason.includes("state_capture_unavailable"))) return "TRUTH_BLOCKED";
  return "COLLECTING";
}

function base(
  capability: PredictiveCapability,
  result: PredictiveReadinessCapabilityResult<unknown>,
  complete: boolean,
  evidenceDeficits: Array<PredictiveGraduationEvidenceDeficit | null>,
  truthRequirements: PredictiveGraduationTruthRequirement[],
  qualityMargins: PredictiveGraduationQualityMargin[],
): PredictiveGraduationCapabilityCalibration {
  const phase = classify(result, complete);
  return {
    capability,
    decision: result.decision,
    phase,
    manualReviewEligible: complete && result.decision === "PASS",
    qualityEvaluated: result.decision !== "WAIT",
    evidenceDeficits: evidenceDeficits.filter((value): value is PredictiveGraduationEvidenceDeficit => value !== null),
    truthRequirements,
    qualityMargins,
    integrityBlockers: result.reasons.filter((reason) => reason.startsWith("integrity.")),
    collectionBlockers: result.reasons.filter((reason) => reason.startsWith("collection.")),
    readinessReasons: [...result.reasons],
  };
}

export function buildPredictiveGraduationCalibration(
  input: PredictiveReadinessEvidence,
  evaluation: PredictiveReadinessEvaluation,
  options: { complete: boolean },
): PredictiveGraduationCalibration {
  const stale = PREDICTIVE_READINESS_THRESHOLDS.common.maximumCaptureStaleRate;

  const eta = PREDICTIVE_READINESS_THRESHOLDS.ETA;
  const runway = PREDICTIVE_READINESS_THRESHOLDS.RUNWAY;
  const change = PREDICTIVE_READINESS_THRESHOLDS.RUNWAY_CHANGE;
  const trajectory = PREDICTIVE_READINESS_THRESHOLDS.TRAJECTORY;

  return {
    version: PREDICTIVE_GRADUATION_CALIBRATION_VERSION,
    thresholdVersion: evaluation.thresholdVersion,
    complete: options.complete,
    capabilities: {
      ETA: base(
        "ETA",
        evaluation.capabilities.ETA,
        options.complete,
        [
          deficit("observations", input.ETA.observations, eta.minimumObservations),
          deficit("scoreableObservations", input.ETA.scoreableObservations, eta.minimumScoreableObservations),
          deficit("independentTruthFlights", input.ETA.independentTruthFlights, eta.minimumIndependentTruthFlights),
        ],
        [],
        [
          atMost("medianAbsoluteErrorSeconds", input.ETA.medianAbsoluteErrorSeconds, eta.maximumMedianAbsoluteErrorSeconds, "SECONDS"),
          atMost("p90AbsoluteErrorSeconds", input.ETA.p90AbsoluteErrorSeconds, eta.maximumP90AbsoluteErrorSeconds, "SECONDS"),
          atMost("p95AbsoluteErrorSeconds", input.ETA.p95AbsoluteErrorSeconds, eta.maximumP95AbsoluteErrorSeconds, "SECONDS"),
          atMost("captureStaleRate", input.ETA.captureStaleRate, stale, "RATE"),
        ],
      ),
      RUNWAY: base(
        "RUNWAY",
        evaluation.capabilities.RUNWAY,
        options.complete,
        [
          deficit("observations", input.RUNWAY.observations, runway.minimumObservations),
          deficit("scoreableObservations", input.RUNWAY.scoreableObservations, runway.minimumScoreableObservations),
          deficit("independentTruthFlights", input.RUNWAY.independentTruthFlights, runway.minimumIndependentTruthFlights),
        ],
        [],
        [
          atLeast("exactEndAccuracy", input.RUNWAY.exactEndAccuracy, runway.minimumExactEndAccuracy, "RATE"),
          atLeast("coverage", input.RUNWAY.coverage, runway.minimumCoverage, "RATE"),
          atMost("captureStaleRate", input.RUNWAY.captureStaleRate, stale, "RATE"),
        ],
      ),
      RUNWAY_CHANGE: base(
        "RUNWAY_CHANGE",
        evaluation.capabilities.RUNWAY_CHANGE,
        options.complete,
        [
          deficit("observations", input.RUNWAY_CHANGE.observations, change.minimumObservations),
          deficit("scoreableObservations", input.RUNWAY_CHANGE.scoreableObservations, change.minimumScoreableObservations),
          deficit("independentTruthFlights", input.RUNWAY_CHANGE.independentTruthFlights, change.minimumIndependentTruthFlights),
        ],
        [
          { key: "independentChangeTruthAvailable", available: input.RUNWAY_CHANGE.independentChangeTruthAvailable },
        ],
        [
          atLeast("outcomePrecision", input.RUNWAY_CHANGE.outcomePrecision, change.minimumOutcomePrecision, "RATE"),
          atMost("falsePositiveRate", input.RUNWAY_CHANGE.falsePositiveRate, change.maximumFalsePositiveRate, "RATE"),
          atMost("captureStaleRate", input.RUNWAY_CHANGE.captureStaleRate, stale, "RATE"),
        ],
      ),
      TRAJECTORY: base(
        "TRAJECTORY",
        evaluation.capabilities.TRAJECTORY,
        options.complete,
        [
          deficit("observations", input.TRAJECTORY.observations, trajectory.minimumObservations),
          deficit("validatedCandidates", input.TRAJECTORY.validatedCandidates, trajectory.minimumValidatedCandidates),
        ],
        [
          { key: "stateCaptureAvailable", available: input.TRAJECTORY.stateCaptureAvailable },
          { key: "independentOutcomeTruthAvailable", available: input.TRAJECTORY.independentOutcomeTruthAvailable },
        ],
        [
          atLeast("precision", input.TRAJECTORY.precision, trajectory.minimumPrecision, "RATE"),
          atMost("captureStaleRate", input.TRAJECTORY.captureStaleRate, stale, "RATE"),
        ],
      ),
    },
  };
}
