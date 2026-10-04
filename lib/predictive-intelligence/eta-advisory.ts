import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";
import type { PredictiveCapabilityStatus, PredictiveGraduationPolicy } from "@/lib/predictive-intelligence/graduation";
import type { EtaPrediction, PredictiveFlightState, PredictionConfidence } from "@/lib/predictive-intelligence/types";

export const ETA_ADVISORY_STALE_AFTER_MS = 45_000;

export type EtaAdvisoryState = "available" | "unavailable" | "stale" | "expired";
export type EtaUncertaintyBasis = "readiness_p90" | "not_calibrated";

export interface PublicEtaAdvisory {
  kind: "ETA";
  state: "available";
  estimatedArrivalAt: string;
  evaluatedAt: string;
  ageSeconds: number;
  horizonMinutes: number;
  confidence: PredictionConfidence;
  uncertaintyMinutes: number;
  uncertaintyBasis: "readiness_p90";
  modelVersion: PredictiveFlightState["modelVersion"];
  provenance: "predicted";
}

export interface AdminEtaAdvisoryPreview {
  kind: "ETA";
  mode: PredictiveCapabilityStatus;
  readiness: "PASS" | "WAIT" | "FAIL";
  readinessReasons: string[];
  publicEligible: boolean;
  state: EtaAdvisoryState;
  estimatedArrivalAt: string | null;
  evaluatedAt: string | null;
  ageSeconds: number | null;
  horizonMinutes: number | null;
  confidence: PredictionConfidence;
  uncertaintyMinutes: number | null;
  uncertaintyBasis: EtaUncertaintyBasis;
  modelVersion: PredictiveFlightState["modelVersion"] | null;
  provenance: "predicted";
}

type EtaReadinessResult = PredictiveReadinessCapabilityResult<{
  observations: number;
  scoreableObservations: number;
  independentTruthFlights: number;
  medianAbsoluteErrorSeconds: number | null;
  p90AbsoluteErrorSeconds: number | null;
  p95AbsoluteErrorSeconds: number | null;
  captureStaleRate: number | null;
}>;

function uncertaintyMinutes(readiness: EtaReadinessResult | null): number | null {
  const seconds = readiness?.evidence.p90AbsoluteErrorSeconds ?? null;
  return seconds !== null && Number.isFinite(seconds) && seconds >= 0
    ? Math.max(1, Math.ceil(seconds / 60))
    : null;
}

function advisoryState(
  prediction: PredictiveFlightState | null,
  now: number,
): { state: EtaAdvisoryState; eta: EtaPrediction | null; ageSeconds: number | null; horizonMinutes: number | null } {
  if (!prediction) return { state: "unavailable", eta: null, ageSeconds: null, horizonMinutes: null };
  const ageMs = Math.max(0, now - prediction.evaluatedAt);
  const ageSeconds = Math.floor(ageMs / 1_000);
  if (ageMs > ETA_ADVISORY_STALE_AFTER_MS) {
    return { state: "stale", eta: prediction.eta, ageSeconds, horizonMinutes: prediction.eta.estimatedArrivalAt === null ? null : Math.ceil((prediction.eta.estimatedArrivalAt - now) / 60_000) };
  }
  const estimatedArrivalAt = prediction.eta.estimatedArrivalAt;
  if (estimatedArrivalAt === null || prediction.eta.confidence === "UNKNOWN") {
    return { state: "unavailable", eta: prediction.eta, ageSeconds, horizonMinutes: null };
  }
  const horizonMs = estimatedArrivalAt - now;
  if (horizonMs <= 0) return { state: "expired", eta: prediction.eta, ageSeconds, horizonMinutes: 0 };
  return {
    state: "available",
    eta: prediction.eta,
    ageSeconds,
    horizonMinutes: Math.max(1, Math.ceil(horizonMs / 60_000)),
  };
}

export function buildPublicEtaAdvisory(
  prediction: PredictiveFlightState | null,
  effectivePolicy: PredictiveGraduationPolicy,
  readiness: EtaReadinessResult | null,
  now = Date.now(),
): PublicEtaAdvisory | null {
  if (effectivePolicy.ETA !== "PUBLIC" || readiness?.decision !== "PASS") return null;
  const status = advisoryState(prediction, now);
  const uncertainty = uncertaintyMinutes(readiness);
  if (status.state !== "available" || !prediction || !status.eta?.estimatedArrivalAt || uncertainty === null || status.ageSeconds === null || status.horizonMinutes === null) return null;

  return {
    kind: "ETA",
    state: "available",
    estimatedArrivalAt: new Date(status.eta.estimatedArrivalAt).toISOString(),
    evaluatedAt: new Date(prediction.evaluatedAt).toISOString(),
    ageSeconds: status.ageSeconds,
    horizonMinutes: status.horizonMinutes,
    confidence: status.eta.confidence,
    uncertaintyMinutes: uncertainty,
    uncertaintyBasis: "readiness_p90",
    modelVersion: prediction.modelVersion,
    provenance: "predicted",
  };
}

export function buildAdminEtaAdvisoryPreview(
  prediction: PredictiveFlightState | null,
  configuredPolicy: PredictiveGraduationPolicy,
  readiness: EtaReadinessResult,
  now = Date.now(),
): AdminEtaAdvisoryPreview {
  const status = advisoryState(prediction, now);
  const uncertainty = uncertaintyMinutes(readiness);
  const estimatedArrivalAt = status.eta?.estimatedArrivalAt ?? null;
  const publicEligible = configuredPolicy.ETA === "PUBLIC"
    && readiness.decision === "PASS"
    && status.state === "available"
    && uncertainty !== null;

  return {
    kind: "ETA",
    mode: configuredPolicy.ETA,
    readiness: readiness.decision,
    readinessReasons: [...readiness.reasons],
    publicEligible,
    state: status.state,
    estimatedArrivalAt: estimatedArrivalAt === null ? null : new Date(estimatedArrivalAt).toISOString(),
    evaluatedAt: prediction ? new Date(prediction.evaluatedAt).toISOString() : null,
    ageSeconds: status.ageSeconds,
    horizonMinutes: status.horizonMinutes,
    confidence: status.eta?.confidence ?? "UNKNOWN",
    uncertaintyMinutes: uncertainty,
    uncertaintyBasis: uncertainty === null ? "not_calibrated" : "readiness_p90",
    modelVersion: prediction?.modelVersion ?? null,
    provenance: "predicted",
  };
}
