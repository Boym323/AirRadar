import type { PredictiveGraduationCapabilityCalibration } from "./graduation-calibration";
import type { PredictiveCapabilityStatus } from "./graduation";
import type { PredictiveReadinessCapabilityResult } from "./readiness";
import {
  buildPredictivePublicRolloutDecision,
  type PredictivePublicRolloutDecision,
} from "./public-rollout";

export const RUNWAY_PUBLIC_ROLLOUT_VERSION = "runway-public-rollout-v1" as const;

export type RunwayPublicRolloutDecision =
  PredictivePublicRolloutDecision<typeof RUNWAY_PUBLIC_ROLLOUT_VERSION>;

type RunwayReadiness = PredictiveReadinessCapabilityResult<unknown>;

export function buildRunwayPublicRolloutDecision(input: {
  configuredMode: PredictiveCapabilityStatus;
  effectiveMode: PredictiveCapabilityStatus;
  readiness: RunwayReadiness;
  calibration: PredictiveGraduationCapabilityCalibration;
}): RunwayPublicRolloutDecision {
  return buildPredictivePublicRolloutDecision({
    version: RUNWAY_PUBLIC_ROLLOUT_VERSION,
    ...input,
  });
}
