import type { PredictiveFlightState, PredictionConfidence } from "./types";

export type PredictiveCapability = "ETA" | "RUNWAY" | "RUNWAY_CHANGE" | "TRAJECTORY";
export type PredictiveCapabilityStatus = "PUBLIC" | "SHADOW" | "DISABLED";

export interface PredictiveGraduationPolicy {
  ETA: PredictiveCapabilityStatus;
  RUNWAY: PredictiveCapabilityStatus;
  RUNWAY_CHANGE: PredictiveCapabilityStatus;
  TRAJECTORY: PredictiveCapabilityStatus;
}

// Public graduation is deliberately opt-in. Historical holdout evidence and a
// production shadow run must exist before a capability can become public.
export const DEFAULT_PREDICTIVE_GRADUATION: PredictiveGraduationPolicy = {
  ETA: "SHADOW",
  RUNWAY: "SHADOW",
  RUNWAY_CHANGE: "SHADOW",
  TRAJECTORY: "SHADOW",
};

function status(value: string | undefined, fallback: PredictiveCapabilityStatus): PredictiveCapabilityStatus {
  return value === "PUBLIC" || value === "DISABLED" || value === "SHADOW" ? value : fallback;
}

export function getPredictiveGraduationPolicy(env: Readonly<Record<string, string | undefined>> = process.env): PredictiveGraduationPolicy {
  return {
    ETA: status(env.AIRRADAR_PREDICTIVE_ETA_STATUS, DEFAULT_PREDICTIVE_GRADUATION.ETA),
    RUNWAY: status(env.AIRRADAR_PREDICTIVE_RUNWAY_STATUS, DEFAULT_PREDICTIVE_GRADUATION.RUNWAY),
    RUNWAY_CHANGE: status(env.AIRRADAR_PREDICTIVE_RUNWAY_CHANGE_STATUS, DEFAULT_PREDICTIVE_GRADUATION.RUNWAY_CHANGE),
    TRAJECTORY: status(env.AIRRADAR_PREDICTIVE_TRAJECTORY_STATUS, DEFAULT_PREDICTIVE_GRADUATION.TRAJECTORY),
  };
}

export interface PublicPredictiveState {
  modelVersion: PredictiveFlightState["modelVersion"];
  evaluatedAt: string;
  freshness: "fresh" | "stale";
  eta?: { status: "available" | "unavailable"; estimatedArrivalAt: string | null; confidence: PredictionConfidence };
  runway?: { status: "available" | "unavailable"; runway: string | null; confidence: PredictionConfidence };
  runwayChange?: { status: "available" | "unavailable"; changedFrom: string | null; runway: string | null; confidence: PredictionConfidence };
  trajectory?: { state: PredictiveFlightState["trajectory"]["state"]; confidence: PredictionConfidence };
}

const STALE_AFTER_MS = 45_000;

export function toPublicPredictiveState(prediction: PredictiveFlightState | null, policy = getPredictiveGraduationPolicy(), now = Date.now()): PublicPredictiveState | null {
  if (!prediction) return null;
  const fresh = now - prediction.evaluatedAt <= STALE_AFTER_MS;
  const result: PublicPredictiveState = {
    modelVersion: prediction.modelVersion,
    evaluatedAt: new Date(prediction.evaluatedAt).toISOString(),
    freshness: fresh ? "fresh" : "stale",
  };
  if (policy.ETA === "PUBLIC" && fresh) {
    const estimatedArrivalAt = prediction.eta.estimatedArrivalAt;
    const available = estimatedArrivalAt !== null && estimatedArrivalAt > now && prediction.eta.confidence !== "UNKNOWN";
    result.eta = {
      status: available ? "available" : "unavailable",
      estimatedArrivalAt: available && estimatedArrivalAt !== null ? new Date(estimatedArrivalAt).toISOString() : null,
      confidence: prediction.eta.confidence,
    };
  }
  if (policy.RUNWAY === "PUBLIC" && fresh) {
    const available = prediction.runway.runway !== null && prediction.runway.confidence !== "UNKNOWN";
    result.runway = {
      status: available ? "available" : "unavailable",
      runway: available ? prediction.runway.runway : null,
      confidence: prediction.runway.confidence,
    };
  }
  if (policy.RUNWAY_CHANGE === "PUBLIC" && fresh) {
    const available = prediction.runway.changed
      && prediction.runway.runway !== null
      && prediction.runway.confidence !== "UNKNOWN";
    result.runwayChange = {
      status: available ? "available" : "unavailable",
      changedFrom: available ? prediction.runway.alternative : null,
      runway: available ? prediction.runway.runway : null,
      confidence: prediction.runway.confidence,
    };
  }
  if (policy.TRAJECTORY === "PUBLIC" && fresh) {
    result.trajectory = { state: prediction.trajectory.state, confidence: prediction.trajectory.confidence };
  }
  return result;
}
