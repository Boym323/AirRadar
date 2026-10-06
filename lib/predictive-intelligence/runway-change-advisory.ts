import type { PredictiveCapabilityStatus, PredictiveGraduationPolicy } from "./graduation";
import { explainablePredictionEvidence, type ExplainablePredictionEvidence } from "./explainability";
import type { PredictiveReadinessCapabilityResult, RunwayChangeReadinessEvidence } from "./readiness";
import {
  RUNWAY_CHANGE_EVENT_WINDOW_MS,
  type PredictiveFlightState,
  type PredictionConfidence,
} from "./types";

export const RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS = 45_000;
export const RUNWAY_CHANGE_ADVISORY_EVENT_WINDOW_MS = RUNWAY_CHANGE_EVENT_WINDOW_MS;

export type RunwayChangeAdvisoryState = "available" | "unavailable" | "stale" | "expired";

export interface PublicRunwayChangeAdvisory {
  kind: "RUNWAY_CHANGE";
  state: "available";
  changedFrom: string;
  runway: string;
  changedAt: string;
  evaluatedAt: string;
  ageSeconds: number;
  changeAgeSeconds: number;
  confidence: PredictionConfidence;
  modelVersion: PredictiveFlightState["modelVersion"];
  provenance: "predicted";
  evidence: ExplainablePredictionEvidence[];
}

export interface AdminRunwayChangeAdvisoryPreview {
  kind: "RUNWAY_CHANGE";
  mode: PredictiveCapabilityStatus;
  readiness: "PASS" | "WAIT" | "FAIL";
  readinessReasons: string[];
  publicEligible: boolean;
  state: RunwayChangeAdvisoryState;
  changedFrom: string | null;
  runway: string | null;
  changedAt: string | null;
  evaluatedAt: string | null;
  ageSeconds: number | null;
  changeAgeSeconds: number | null;
  confidence: PredictionConfidence;
  outcomePrecision: number | null;
  falsePositiveRate: number | null;
  independentChangeTruthAvailable: boolean;
  modelVersion: PredictiveFlightState["modelVersion"] | null;
  provenance: "predicted";
  evidence: ExplainablePredictionEvidence[];
}

type RunwayChangeReadinessResult = PredictiveReadinessCapabilityResult<RunwayChangeReadinessEvidence>;

function advisoryState(
  prediction: PredictiveFlightState | null,
  now: number,
): {
  state: RunwayChangeAdvisoryState;
  ageSeconds: number | null;
  changeAgeSeconds: number | null;
} {
  if (!prediction) return { state: "unavailable", ageSeconds: null, changeAgeSeconds: null };

  const ageMs = Math.max(0, now - prediction.evaluatedAt);
  const ageSeconds = Math.floor(ageMs / 1_000);
  if (ageMs > RUNWAY_CHANGE_ADVISORY_STALE_AFTER_MS) {
    return { state: "stale", ageSeconds, changeAgeSeconds: null };
  }

  const changedAt = prediction.runway.changedAt;
  const changedFrom = prediction.runway.changedFrom;
  if (
    !prediction.runway.changed
    || !changedFrom
    || !prediction.runway.runway
    || changedAt === null
    || changedAt === undefined
  ) {
    return { state: "unavailable", ageSeconds, changeAgeSeconds: null };
  }

  if (!Number.isFinite(changedAt) || changedAt > now) {
    return { state: "unavailable", ageSeconds, changeAgeSeconds: null };
  }

  const changeAgeMs = now - changedAt;
  const changeAgeSeconds = Math.floor(changeAgeMs / 1_000);
  if (changeAgeMs > RUNWAY_CHANGE_EVENT_WINDOW_MS) {
    return { state: "expired", ageSeconds, changeAgeSeconds };
  }

  return { state: "available", ageSeconds, changeAgeSeconds };
}

export function buildPublicRunwayChangeAdvisory(
  prediction: PredictiveFlightState | null,
  effectivePolicy: PredictiveGraduationPolicy,
  readiness: RunwayChangeReadinessResult | null,
  now = Date.now(),
): PublicRunwayChangeAdvisory | null {
  if (effectivePolicy.RUNWAY_CHANGE !== "PUBLIC" || readiness?.decision !== "PASS") return null;

  const status = advisoryState(prediction, now);
  const runway = prediction?.runway;
  if (
    status.state !== "available"
    || !prediction
    || !runway?.runway
    || !runway.changedFrom
    || runway.changedAt === null
    || runway.changedAt === undefined
    || status.ageSeconds === null
    || status.changeAgeSeconds === null
    || runway.confidence === "LOW"
    || runway.confidence === "UNKNOWN"
  ) {
    return null;
  }

  return {
    kind: "RUNWAY_CHANGE",
    state: "available",
    changedFrom: runway.changedFrom,
    runway: runway.runway,
    changedAt: new Date(runway.changedAt).toISOString(),
    evaluatedAt: new Date(prediction.evaluatedAt).toISOString(),
    ageSeconds: status.ageSeconds,
    changeAgeSeconds: status.changeAgeSeconds,
    confidence: runway.confidence,
    modelVersion: prediction.modelVersion,
    provenance: "predicted",
    evidence: explainablePredictionEvidence("RUNWAY_CHANGE", runway.evidence),
  };
}

export function buildAdminRunwayChangeAdvisoryPreview(
  prediction: PredictiveFlightState | null,
  configuredPolicy: PredictiveGraduationPolicy,
  readiness: RunwayChangeReadinessResult,
  now = Date.now(),
): AdminRunwayChangeAdvisoryPreview {
  const status = advisoryState(prediction, now);
  const runway = prediction?.runway ?? null;
  const publicEligible = configuredPolicy.RUNWAY_CHANGE === "PUBLIC"
    && readiness.decision === "PASS"
    && status.state === "available"
    && runway?.confidence !== "LOW"
    && runway?.confidence !== "UNKNOWN";

  return {
    kind: "RUNWAY_CHANGE",
    mode: configuredPolicy.RUNWAY_CHANGE,
    readiness: readiness.decision,
    readinessReasons: [...readiness.reasons],
    publicEligible,
    state: status.state,
    changedFrom: runway?.changedFrom ?? null,
    runway: runway?.runway ?? null,
    changedAt: runway?.changedAt === null || runway?.changedAt === undefined
      ? null
      : new Date(runway.changedAt).toISOString(),
    evaluatedAt: prediction ? new Date(prediction.evaluatedAt).toISOString() : null,
    ageSeconds: status.ageSeconds,
    changeAgeSeconds: status.changeAgeSeconds,
    confidence: runway?.confidence ?? "UNKNOWN",
    outcomePrecision: readiness.evidence.outcomePrecision,
    falsePositiveRate: readiness.evidence.falsePositiveRate,
    independentChangeTruthAvailable: readiness.evidence.independentChangeTruthAvailable,
    modelVersion: prediction?.modelVersion ?? null,
    provenance: "predicted",
    evidence: explainablePredictionEvidence("RUNWAY_CHANGE", runway?.evidence ?? []),
  };
}
