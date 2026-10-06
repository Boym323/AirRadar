import type { PredictiveCapabilityStatus, PredictiveGraduationPolicy } from "./graduation";
import { explainablePredictionEvidence, type ExplainablePredictionEvidence } from "./explainability";
import type {
  PredictiveReadinessCapabilityResult,
  TrajectoryReadinessEvidence,
} from "./readiness";
import type {
  PredictiveFlightState,
  PredictionConfidence,
  TrajectoryState,
} from "./types";

export const TRAJECTORY_ADVISORY_STALE_AFTER_MS = 45_000;

export type TrajectoryAdvisoryAvailability = "available" | "unavailable" | "stale";

export interface PublicTrajectoryAdvisory {
  kind: "TRAJECTORY";
  state: "available";
  trajectoryState: Exclude<TrajectoryState, "UNKNOWN">;
  evaluatedAt: string;
  ageSeconds: number;
  confidence: PredictionConfidence;
  modelVersion: PredictiveFlightState["modelVersion"];
  provenance: "predicted";
  evidence: ExplainablePredictionEvidence[];
}

export interface AdminTrajectoryAdvisoryPreview {
  kind: "TRAJECTORY";
  mode: PredictiveCapabilityStatus;
  readiness: "PASS" | "WAIT" | "FAIL";
  readinessReasons: string[];
  publicEligible: boolean;
  state: TrajectoryAdvisoryAvailability;
  trajectoryState: TrajectoryState;
  evaluatedAt: string | null;
  ageSeconds: number | null;
  confidence: PredictionConfidence;
  candidateObservations: number | null;
  validatedCandidates: number;
  precision: number | null;
  stateCaptureAvailable: boolean;
  independentOutcomeTruthAvailable: boolean;
  modelVersion: PredictiveFlightState["modelVersion"] | null;
  provenance: "predicted";
  evidence: ExplainablePredictionEvidence[];
}

type TrajectoryReadinessResult = PredictiveReadinessCapabilityResult<TrajectoryReadinessEvidence>;

function advisoryState(
  prediction: PredictiveFlightState | null,
  now: number,
): { state: TrajectoryAdvisoryAvailability; ageSeconds: number | null } {
  if (!prediction) return { state: "unavailable", ageSeconds: null };

  const ageMs = Math.max(0, now - prediction.evaluatedAt);
  const ageSeconds = Math.floor(ageMs / 1_000);
  if (ageMs > TRAJECTORY_ADVISORY_STALE_AFTER_MS) return { state: "stale", ageSeconds };
  if (prediction.trajectory.state === "UNKNOWN") return { state: "unavailable", ageSeconds };
  return { state: "available", ageSeconds };
}

function publicConfidence(confidence: PredictionConfidence): boolean {
  return confidence === "MEDIUM" || confidence === "HIGH";
}

export function buildPublicTrajectoryAdvisory(
  prediction: PredictiveFlightState | null,
  effectivePolicy: PredictiveGraduationPolicy,
  readiness: TrajectoryReadinessResult | null,
  now = Date.now(),
): PublicTrajectoryAdvisory | null {
  if (effectivePolicy.TRAJECTORY !== "PUBLIC" || readiness?.decision !== "PASS") return null;

  const status = advisoryState(prediction, now);
  if (
    status.state !== "available"
    || !prediction
    || status.ageSeconds === null
    || prediction.trajectory.state === "UNKNOWN"
    || !publicConfidence(prediction.trajectory.confidence)
  ) {
    return null;
  }

  return {
    kind: "TRAJECTORY",
    state: "available",
    trajectoryState: prediction.trajectory.state,
    evaluatedAt: new Date(prediction.evaluatedAt).toISOString(),
    ageSeconds: status.ageSeconds,
    confidence: prediction.trajectory.confidence,
    modelVersion: prediction.modelVersion,
    provenance: "predicted",
    evidence: explainablePredictionEvidence("TRAJECTORY", prediction.trajectory.evidence),
  };
}

export function buildAdminTrajectoryAdvisoryPreview(
  prediction: PredictiveFlightState | null,
  configuredPolicy: PredictiveGraduationPolicy,
  readiness: TrajectoryReadinessResult,
  now = Date.now(),
): AdminTrajectoryAdvisoryPreview {
  const status = advisoryState(prediction, now);
  const publicEligible = configuredPolicy.TRAJECTORY === "PUBLIC"
    && readiness.decision === "PASS"
    && status.state === "available"
    && prediction?.trajectory.state !== "UNKNOWN"
    && publicConfidence(prediction?.trajectory.confidence ?? "UNKNOWN");

  return {
    kind: "TRAJECTORY",
    mode: configuredPolicy.TRAJECTORY,
    readiness: readiness.decision,
    readinessReasons: [...readiness.reasons],
    publicEligible,
    state: status.state,
    trajectoryState: prediction?.trajectory.state ?? "UNKNOWN",
    evaluatedAt: prediction ? new Date(prediction.evaluatedAt).toISOString() : null,
    ageSeconds: status.ageSeconds,
    confidence: prediction?.trajectory.confidence ?? "UNKNOWN",
    candidateObservations: readiness.evidence.candidateObservations,
    validatedCandidates: readiness.evidence.validatedCandidates,
    precision: readiness.evidence.precision,
    stateCaptureAvailable: readiness.evidence.stateCaptureAvailable,
    independentOutcomeTruthAvailable: readiness.evidence.independentOutcomeTruthAvailable,
    modelVersion: prediction?.modelVersion ?? null,
    provenance: "predicted",
    evidence: explainablePredictionEvidence("TRAJECTORY", prediction?.trajectory.evidence ?? []),
  };
}
