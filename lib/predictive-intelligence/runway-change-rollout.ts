import type { PredictiveGraduationCapabilityCalibration } from "./graduation-calibration";
import type { PredictiveCapabilityStatus } from "./graduation";
import type { PredictiveReadinessCapabilityResult } from "./readiness";
import {
  buildPredictivePublicRolloutDecision,
  type PredictivePublicRolloutDecision,
} from "./public-rollout";

export const RUNWAY_CHANGE_PUBLIC_ROLLOUT_VERSION = "runway-change-public-rollout-v1" as const;

export type RunwayChangePublicRolloutDecision =
  PredictivePublicRolloutDecision<typeof RUNWAY_CHANGE_PUBLIC_ROLLOUT_VERSION>;

type RunwayChangeReadiness = PredictiveReadinessCapabilityResult<unknown>;

export function buildRunwayChangePublicRolloutDecision(input: {
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: RunwayChangeReadiness;
  calibration: PredictiveGraduationCapabilityCalibration;
}): RunwayChangePublicRolloutDecision {
  return buildPredictivePublicRolloutDecision({
    version: RUNWAY_CHANGE_PUBLIC_ROLLOUT_VERSION,
    ...input,
  });
}
