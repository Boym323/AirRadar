import type { PredictiveCapabilityStatus } from "./graduation";
import type { PredictiveGraduationCapabilityCalibration } from "./graduation-calibration";
import type { PredictiveReadinessCapabilityResult } from "./readiness";

export type PredictivePublicRolloutState =
  | "SHADOW_COLLECTING"
  | "READY_FOR_PUBLIC_CONFIG"
  | "PUBLIC_ACTIVE"
  | "PUBLIC_FAIL_CLOSED"
  | "DISABLED";

export interface PredictivePublicRolloutDecision<Version extends string = string> {
  version: Version;
  state: PredictivePublicRolloutState;
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: "PASS" | "WAIT" | "FAIL";
  manualReviewEligible: boolean;
  publicActive: boolean;
  requiresExplicitConfigChange: boolean;
  blockers: string[];
}

type RolloutReadiness = PredictiveReadinessCapabilityResult<unknown>;

function rolloutBlockers(calibration: PredictiveGraduationCapabilityCalibration): string[] {
  return [...new Set([
    ...calibration.collectionBlockers,
    ...calibration.integrityBlockers,
    ...calibration.readinessReasons,
  ])];
}

export function buildPredictivePublicRolloutDecision<Version extends string>(input: {
  version: Version;
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: RolloutReadiness;
  calibration: PredictiveGraduationCapabilityCalibration;
}): PredictivePublicRolloutDecision<Version> {
  const {
    version,
    configuredMode,
    effectiveMode,
    readiness,
    calibration,
  } = input;
  const blockers = rolloutBlockers(calibration);

  if (configuredMode === "DISABLED") {
    return {
      version,
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
      version,
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
    version,
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
