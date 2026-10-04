import type { PredictiveGraduationCapabilityCalibration } from "./graduation-calibration";
import type { PredictiveCapabilityStatus } from "./graduation";
import type { PredictiveReadinessCapabilityResult } from "./readiness";
import {
  buildPredictivePublicRolloutDecision,
  type PredictivePublicRolloutDecision,
} from "./public-rollout";

export const TRAJECTORY_PUBLIC_ROLLOUT_VERSION = "trajectory-public-rollout-v1" as const;

export type TrajectoryPublicRolloutDecision =
  PredictivePublicRolloutDecision<typeof TRAJECTORY_PUBLIC_ROLLOUT_VERSION>;

type TrajectoryReadiness = PredictiveReadinessCapabilityResult<unknown>;

export function buildTrajectoryPublicRolloutDecision(input: {
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: TrajectoryReadiness;
  calibration: PredictiveGraduationCapabilityCalibration;
}): TrajectoryPublicRolloutDecision {
  return buildPredictivePublicRolloutDecision({
    version: TRAJECTORY_PUBLIC_ROLLOUT_VERSION,
    ...input,
  });
}
