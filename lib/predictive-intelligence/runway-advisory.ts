import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";
import type { PredictiveCapabilityStatus, PredictiveGraduationPolicy } from "@/lib/predictive-intelligence/graduation";
import type { PredictiveFlightState, PredictionConfidence, RunwayPrediction } from "@/lib/predictive-intelligence/types";
import { explainablePredictionEvidence, type ExplainablePredictionEvidence } from "@/lib/predictive-intelligence/explainability";

export const RUNWAY_ADVISORY_STALE_AFTER_MS = 45_000;

export type RunwayAdvisoryState = "available" | "unavailable" | "stale";

export interface PublicRunwayAdvisory {
  kind: "RUNWAY";
  state: "available";
  runway: string;
  alternative: string | null;
  evaluatedAt: string;
  ageSeconds: number;
  confidence: PredictionConfidence;
  modelVersion: PredictiveFlightState["modelVersion"];
  provenance: "predicted";
  evidence: ExplainablePredictionEvidence[];
}

export interface AdminRunwayAdvisoryPreview {
  kind: "RUNWAY";
  mode: PredictiveCapabilityStatus;
  readiness: "PASS" | "WAIT" | "FAIL";
  readinessReasons: string[];
  publicEligible: boolean;
  state: RunwayAdvisoryState;
  runway: string | null;
  alternative: string | null;
  evaluatedAt: string | null;
  ageSeconds: number | null;
  confidence: PredictionConfidence;
  exactEndAccuracy: number | null;
  coverage: number | null;
  modelVersion: PredictiveFlightState["modelVersion"] | null;
  provenance: "predicted";
  evidence: ExplainablePredictionEvidence[];
}

type RunwayReadinessResult = PredictiveReadinessCapabilityResult<{
  observations: number;
  scoreableObservations: number;
  independentTruthFlights: number;
  exactEndAccuracy: number | null;
  coverage: number | null;
  captureStaleRate: number | null;
}>;

function advisoryState(
  prediction: PredictiveFlightState | null,
  now: number,
): { state: RunwayAdvisoryState; runway: RunwayPrediction | null; ageSeconds: number | null } {
  if (!prediction) return { state: "unavailable", runway: null, ageSeconds: null };

  const ageMs = Math.max(0, now - prediction.evaluatedAt);
  const ageSeconds = Math.floor(ageMs / 1_000);
  if (ageMs > RUNWAY_ADVISORY_STALE_AFTER_MS) {
    return { state: "stale", runway: prediction.runway, ageSeconds };
  }

  if (prediction.runway.runway === null || prediction.runway.confidence === "UNKNOWN") {
    return { state: "unavailable", runway: prediction.runway, ageSeconds };
  }

  return { state: "available", runway: prediction.runway, ageSeconds };
}

export function buildPublicRunwayAdvisory(
  prediction: PredictiveFlightState | null,
  effectivePolicy: PredictiveGraduationPolicy,
  readiness: RunwayReadinessResult | null,
  now = Date.now(),
): PublicRunwayAdvisory | null {
  if (effectivePolicy.RUNWAY !== "PUBLIC" || readiness?.decision !== "PASS") return null;

  const status = advisoryState(prediction, now);
  if (
    status.state !== "available"
    || !prediction
    || !status.runway?.runway
    || status.ageSeconds === null
  ) {
    return null;
  }

  return {
    kind: "RUNWAY",
    state: "available",
    runway: status.runway.runway,
    alternative: status.runway.alternative,
    evaluatedAt: new Date(prediction.evaluatedAt).toISOString(),
    ageSeconds: status.ageSeconds,
    confidence: status.runway.confidence,
    modelVersion: prediction.modelVersion,
    provenance: "predicted",
    evidence: explainablePredictionEvidence("RUNWAY", status.runway.evidence),
  };
}

export function buildAdminRunwayAdvisoryPreview(
  prediction: PredictiveFlightState | null,
  configuredPolicy: PredictiveGraduationPolicy,
  readiness: RunwayReadinessResult,
  now = Date.now(),
): AdminRunwayAdvisoryPreview {
  const status = advisoryState(prediction, now);
  const publicEligible = configuredPolicy.RUNWAY === "PUBLIC"
    && readiness.decision === "PASS"
    && status.state === "available";

  return {
    kind: "RUNWAY",
    mode: configuredPolicy.RUNWAY,
    readiness: readiness.decision,
    readinessReasons: [...readiness.reasons],
    publicEligible,
    state: status.state,
    runway: status.runway?.runway ?? null,
    alternative: status.runway?.alternative ?? null,
    evaluatedAt: prediction ? new Date(prediction.evaluatedAt).toISOString() : null,
    ageSeconds: status.ageSeconds,
    confidence: status.runway?.confidence ?? "UNKNOWN",
    exactEndAccuracy: readiness.evidence.exactEndAccuracy,
    coverage: readiness.evidence.coverage,
    modelVersion: prediction?.modelVersion ?? null,
    provenance: "predicted",
    evidence: explainablePredictionEvidence("RUNWAY", status.runway?.evidence ?? []),
  };
}
