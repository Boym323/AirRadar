import type { PredictiveCapability } from "./graduation";

export const PREDICTIVE_READINESS_VERSION = "predictive-readiness-v1" as const;

export type PredictiveReadinessDecision = "PASS" | "WAIT" | "FAIL";

export interface PredictiveReadinessIntegrity {
  crossIcaoLifecycleConflicts: number;
  crossFlightLifecycleConflicts: number;
}

export interface EtaReadinessEvidence {
  observations: number;
  scoreableObservations: number;
  independentTruthFlights: number;
  medianAbsoluteErrorSeconds: number | null;
  p90AbsoluteErrorSeconds: number | null;
  p95AbsoluteErrorSeconds: number | null;
  captureStaleRate: number | null;
}

export interface RunwayReadinessEvidence {
  observations: number;
  scoreableObservations: number;
  independentTruthFlights: number;
  exactEndAccuracy: number | null;
  coverage: number | null;
  captureStaleRate: number | null;
}

export interface RunwayChangeReadinessEvidence {
  observations: number;
  scoreableObservations: number;
  independentTruthFlights: number;
  outcomePrecision: number | null;
  falsePositiveRate: number | null;
  independentChangeTruthAvailable: boolean;
  captureStaleRate: number | null;
}

export interface TrajectoryReadinessEvidence {
  observations: number;
  candidateObservations: number | null;
  validatedCandidates: number;
  precision: number | null;
  stateCaptureAvailable: boolean;
  independentOutcomeTruthAvailable: boolean;
  captureStaleRate: number | null;
}

export interface PredictiveReadinessEvidence {
  ETA: EtaReadinessEvidence;
  RUNWAY: RunwayReadinessEvidence;
  RUNWAY_CHANGE: RunwayChangeReadinessEvidence;
  TRAJECTORY: TrajectoryReadinessEvidence;
  integrity: PredictiveReadinessIntegrity;
}

export interface PredictiveReadinessCapabilityResult<T> {
  capability: PredictiveCapability;
  decision: PredictiveReadinessDecision;
  evidence: T;
  reasons: string[];
}

export interface PredictiveReadinessEvaluation {
  thresholdVersion: typeof PREDICTIVE_READINESS_VERSION;
  capabilities: {
    ETA: PredictiveReadinessCapabilityResult<EtaReadinessEvidence>;
    RUNWAY: PredictiveReadinessCapabilityResult<RunwayReadinessEvidence>;
    RUNWAY_CHANGE: PredictiveReadinessCapabilityResult<RunwayChangeReadinessEvidence>;
    TRAJECTORY: PredictiveReadinessCapabilityResult<TrajectoryReadinessEvidence>;
  };
}

export const PREDICTIVE_READINESS_THRESHOLDS = {
  version: PREDICTIVE_READINESS_VERSION,
  common: {
    maximumCaptureStaleRate: 0.05,
    maximumCrossIcaoLifecycleConflicts: 0,
    maximumCrossFlightLifecycleConflicts: 0,
  },
  ETA: {
    minimumObservations: 100,
    minimumScoreableObservations: 100,
    minimumIndependentTruthFlights: 50,
    maximumMedianAbsoluteErrorSeconds: 5 * 60,
    maximumP90AbsoluteErrorSeconds: 10 * 60,
    maximumP95AbsoluteErrorSeconds: 15 * 60,
  },
  RUNWAY: {
    minimumObservations: 100,
    minimumScoreableObservations: 50,
    minimumIndependentTruthFlights: 50,
    minimumExactEndAccuracy: 0.85,
    minimumCoverage: 0.60,
  },
  RUNWAY_CHANGE: {
    minimumObservations: 30,
    minimumScoreableObservations: 20,
    minimumIndependentTruthFlights: 20,
    minimumOutcomePrecision: 0.80,
    maximumFalsePositiveRate: 0.20,
    requiresIndependentChangeTruth: true,
  },
  TRAJECTORY: {
    minimumObservations: 100,
    minimumValidatedCandidates: 50,
    minimumPrecision: 0.80,
    requiresStateCapture: true,
    requiresIndependentOutcomeTruth: true,
  },
} as const;

function commonIntegrityFailure(integrity: PredictiveReadinessIntegrity): string[] {
  const reasons: string[] = [];
  if (integrity.crossIcaoLifecycleConflicts > PREDICTIVE_READINESS_THRESHOLDS.common.maximumCrossIcaoLifecycleConflicts) {
    reasons.push("integrity.cross_icao_lifecycle_conflict");
  }
  if (integrity.crossFlightLifecycleConflicts > PREDICTIVE_READINESS_THRESHOLDS.common.maximumCrossFlightLifecycleConflicts) {
    reasons.push("integrity.cross_flight_lifecycle_conflict");
  }
  return reasons;
}

function staleFailure(rate: number | null): boolean {
  return rate !== null && rate > PREDICTIVE_READINESS_THRESHOLDS.common.maximumCaptureStaleRate;
}

function capabilityResult<T>(
  capability: PredictiveCapability,
  evidence: T,
  waitReasons: string[],
  failReasons: string[],
): PredictiveReadinessCapabilityResult<T> {
  if (failReasons.length) return { capability, decision: "FAIL", evidence, reasons: failReasons };
  if (waitReasons.length) return { capability, decision: "WAIT", evidence, reasons: waitReasons };
  return { capability, decision: "PASS", evidence, reasons: [] };
}

export function evaluatePredictiveReadiness(input: PredictiveReadinessEvidence, options: { complete?: boolean } = {}): PredictiveReadinessEvaluation {
  const integrityFailures = commonIntegrityFailure(input.integrity);
  const collectionWait = options.complete === false ? ["collection.bounded_result_incomplete"] : [];

  const etaWait: string[] = [...collectionWait];
  const etaFail = [...integrityFailures];
  const etaThreshold = PREDICTIVE_READINESS_THRESHOLDS.ETA;
  if (input.ETA.observations < etaThreshold.minimumObservations) etaWait.push("eta.insufficient_observations");
  if (input.ETA.scoreableObservations < etaThreshold.minimumScoreableObservations) etaWait.push("eta.insufficient_scoreable_observations");
  if (input.ETA.independentTruthFlights < etaThreshold.minimumIndependentTruthFlights) etaWait.push("eta.insufficient_independent_truth");
  const etaHasEvidence = etaWait.length === 0;
  if (etaHasEvidence && (input.ETA.medianAbsoluteErrorSeconds === null || input.ETA.medianAbsoluteErrorSeconds > etaThreshold.maximumMedianAbsoluteErrorSeconds)) etaFail.push("eta.median_error_exceeds_threshold");
  if (etaHasEvidence && (input.ETA.p90AbsoluteErrorSeconds === null || input.ETA.p90AbsoluteErrorSeconds > etaThreshold.maximumP90AbsoluteErrorSeconds)) etaFail.push("eta.p90_error_exceeds_threshold");
  if (etaHasEvidence && (input.ETA.p95AbsoluteErrorSeconds === null || input.ETA.p95AbsoluteErrorSeconds > etaThreshold.maximumP95AbsoluteErrorSeconds)) etaFail.push("eta.p95_error_exceeds_threshold");
  if (etaHasEvidence && staleFailure(input.ETA.captureStaleRate)) etaFail.push("eta.capture_stale_rate_exceeds_threshold");

  const runwayWait: string[] = [...collectionWait];
  const runwayFail = [...integrityFailures];
  const runwayThreshold = PREDICTIVE_READINESS_THRESHOLDS.RUNWAY;
  if (input.RUNWAY.observations < runwayThreshold.minimumObservations) runwayWait.push("runway.insufficient_observations");
  if (input.RUNWAY.scoreableObservations < runwayThreshold.minimumScoreableObservations) runwayWait.push("runway.insufficient_scoreable_observations");
  if (input.RUNWAY.independentTruthFlights < runwayThreshold.minimumIndependentTruthFlights) runwayWait.push("runway.insufficient_independent_truth");
  const runwayHasEvidence = runwayWait.length === 0;
  if (runwayHasEvidence && (input.RUNWAY.exactEndAccuracy === null || input.RUNWAY.exactEndAccuracy < runwayThreshold.minimumExactEndAccuracy)) runwayFail.push("runway.accuracy_below_threshold");
  if (runwayHasEvidence && (input.RUNWAY.coverage === null || input.RUNWAY.coverage < runwayThreshold.minimumCoverage)) runwayFail.push("runway.coverage_below_threshold");
  if (runwayHasEvidence && staleFailure(input.RUNWAY.captureStaleRate)) runwayFail.push("runway.capture_stale_rate_exceeds_threshold");

  const changeWait: string[] = [...collectionWait];
  const changeFail = [...integrityFailures];
  const changeThreshold = PREDICTIVE_READINESS_THRESHOLDS.RUNWAY_CHANGE;
  if (!input.RUNWAY_CHANGE.independentChangeTruthAvailable) changeWait.push("runway_change.independent_change_truth_unavailable");
  if (input.RUNWAY_CHANGE.observations < changeThreshold.minimumObservations) changeWait.push("runway_change.insufficient_observations");
  if (input.RUNWAY_CHANGE.scoreableObservations < changeThreshold.minimumScoreableObservations) changeWait.push("runway_change.insufficient_scoreable_observations");
  if (input.RUNWAY_CHANGE.independentTruthFlights < changeThreshold.minimumIndependentTruthFlights) changeWait.push("runway_change.insufficient_independent_truth");
  const changeHasEvidence = changeWait.length === 0;
  if (changeHasEvidence && (input.RUNWAY_CHANGE.outcomePrecision === null || input.RUNWAY_CHANGE.outcomePrecision < changeThreshold.minimumOutcomePrecision)) changeFail.push("runway_change.precision_below_threshold");
  if (changeHasEvidence && (input.RUNWAY_CHANGE.falsePositiveRate === null || input.RUNWAY_CHANGE.falsePositiveRate > changeThreshold.maximumFalsePositiveRate)) changeFail.push("runway_change.false_positive_rate_exceeds_threshold");
  if (changeHasEvidence && staleFailure(input.RUNWAY_CHANGE.captureStaleRate)) changeFail.push("runway_change.capture_stale_rate_exceeds_threshold");

  const trajectoryWait: string[] = [...collectionWait];
  const trajectoryFail = [...integrityFailures];
  const trajectoryThreshold = PREDICTIVE_READINESS_THRESHOLDS.TRAJECTORY;
  if (!input.TRAJECTORY.stateCaptureAvailable) trajectoryWait.push("trajectory.state_capture_unavailable");
  if (!input.TRAJECTORY.independentOutcomeTruthAvailable) trajectoryWait.push("trajectory.independent_outcome_truth_unavailable");
  if (input.TRAJECTORY.observations < trajectoryThreshold.minimumObservations) trajectoryWait.push("trajectory.insufficient_observations");
  if (input.TRAJECTORY.validatedCandidates < trajectoryThreshold.minimumValidatedCandidates) trajectoryWait.push("trajectory.insufficient_validated_candidates");
  const trajectoryHasEvidence = trajectoryWait.length === 0;
  if (trajectoryHasEvidence && (input.TRAJECTORY.precision === null || input.TRAJECTORY.precision < trajectoryThreshold.minimumPrecision)) trajectoryFail.push("trajectory.precision_below_threshold");
  if (trajectoryHasEvidence && staleFailure(input.TRAJECTORY.captureStaleRate)) trajectoryFail.push("trajectory.capture_stale_rate_exceeds_threshold");

  return {
    thresholdVersion: PREDICTIVE_READINESS_VERSION,
    capabilities: {
      ETA: capabilityResult("ETA", input.ETA, etaWait, etaFail),
      RUNWAY: capabilityResult("RUNWAY", input.RUNWAY, runwayWait, runwayFail),
      RUNWAY_CHANGE: capabilityResult("RUNWAY_CHANGE", input.RUNWAY_CHANGE, changeWait, changeFail),
      TRAJECTORY: capabilityResult("TRAJECTORY", input.TRAJECTORY, trajectoryWait, trajectoryFail),
    },
  };
}
