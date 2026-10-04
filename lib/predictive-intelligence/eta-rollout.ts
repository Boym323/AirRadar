import type { PredictiveGraduationCapabilityCalibration } from "./graduation-calibration";
import type { PredictiveCapabilityStatus } from "./graduation";
import type { PredictiveReadinessCapabilityResult } from "./readiness";
import {
  buildPredictivePublicRolloutDecision,
  type PredictivePublicRolloutDecision,
} from "./public-rollout";

export const ETA_PUBLIC_ROLLOUT_VERSION = "eta-public-rollout-v1" as const;

export type EtaPublicRolloutDecision =
  PredictivePublicRolloutDecision<typeof ETA_PUBLIC_ROLLOUT_VERSION>;

type EtaReadiness = PredictiveReadinessCapabilityResult<unknown>;

export function buildEtaPublicRolloutDecision(input: {
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: EtaReadiness;
  calibration: PredictiveGraduationCapabilityCalibration;
}): EtaPublicRolloutDecision {
  return buildPredictivePublicRolloutDecision({
    version: ETA_PUBLIC_ROLLOUT_VERSION,
    ...input,
  });
}
