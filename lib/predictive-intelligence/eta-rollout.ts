import type { PredictiveCapabilityStatus } from "./graduation";
import type { PredictiveGraduationCapabilityCalibration } from "./graduation-calibration";
import type { PredictiveReadinessCapabilityResult } from "./readiness";

export const ETA_PUBLIC_ROLLOUT_VERSION = "eta-public-rollout-v1" as const;

export type EtaPublicRolloutState =
  | "SHADOW_COLLECTING"
  | "READY_FOR_PUBLIC_CONFIG"
  | "PUBLIC_ACTIVE"
  | "PUBLIC_FAIL_CLOSED"
  | "DISABLED";

export interface EtaPublicRolloutDecision {
  version: typeof ETA_PUBLIC_ROLLOUT_VERSION;
  state: EtaPublicRolloutState;
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: "PASS" | "WAIT" | "FAIL";
  manualReviewEligible: boolean;
  publicActive: boolean;
  requiresExplicitConfigChange: boolean;
  blockers: string[];
}

type EtaReadiness = PredictiveReadinessCapabilityResult<unknown>;

export function buildEtaPublicRolloutDecision(input: {
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: EtaReadiness;
  calibration: PredictiveGraduationCapabilityCalibration;
}): EtaPublicRolloutDecision {
  const { configuredMode, effectiveMode, readiness, calibration } = input;
  const blockers = [
    ...calibration.collectionBlockers,
    ...calibration.integrityBlockers,
    ...calibration.readinessReasons.filter((reason) =>
      !calibration.collectionBlockers.includes(reason) && !calibration.integrityBlockers.includes(reason)),
  ];

  if (configuredMode === "DISABLED") {
    return {
      version: ETA_PUBLIC_ROLLOUT_VERSION,
      state: "DISABLED",
      configuredMode,
      effectiveMode,
      readiness: readiness.decision,
      manualReviewEligible: false,
      publicActive: false,
      requiresExplicitConfigChange: false,
      blockers,
    };
  }

  if (configuredMode === "PUBLIC") {
    const publicActive = effectiveMode === "PUBLIC" && readiness.decision === "PASS";
    return {
      version: ETA_PUBLIC_ROLLOUT_VERSION,
      state: publicActive ? "PUBLIC_ACTIVE" : "PUBLIC_FAIL_CLOSED",
      configuredMode,
      effectiveMode,
      readiness: readiness.decision,
      manualReviewEligible: calibration.manualReviewEligible,
      publicActive,
      requiresExplicitConfigChange: false,
      blockers: publicActive ? [] : blockers,
    };
  }

  const ready = readiness.decision === "PASS" && calibration.manualReviewEligible;
  return {
    version: ETA_PUBLIC_ROLLOUT_VERSION,
    state: ready ? "READY_FOR_PUBLIC_CONFIG" : "SHADOW_COLLECTING",
    configuredMode,
    effectiveMode,
    readiness: readiness.decision,
    manualReviewEligible: calibration.manualReviewEligible,
    publicActive: false,
    requiresExplicitConfigChange: ready,
    blockers: ready ? [] : blockers,
  };
}
