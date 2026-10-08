import type { PredictiveCapability } from "./graduation";
import type { PredictiveCaptureHealth } from "./capture-health";
import type { PredictiveGraduationCalibration } from "./graduation-calibration";
import type { PredictiveReadinessEvaluation } from "./readiness";

// Operator guidance only: these codes never authorize changing a model policy.
export const PREDICTIVE_EVIDENCE_PLAN_VERSION = "predictive-evidence-plan-v1" as const;

export type PredictiveEvidenceAction =
  | "DATA_UNAVAILABLE" | "COLLECTION_TRUNCATED" | "CAPTURE_DISABLED"
  | "CHECK_CAPTURE_ACTIVITY" | "COLLECT_MORE_FLIGHTS"
  | "OBTAIN_INDEPENDENT_TRUTH" | "INVESTIGATE_QUALITY"
  | "INVESTIGATE_IDENTITY" | "MANUAL_REVIEW" | "CONTINUE_MONITORING";

export interface PredictiveEvidencePlanItem {
  action: PredictiveEvidenceAction;
  decision: "PASS" | "WAIT" | "FAIL";
  blockerCount: number;
  largestEvidenceGap: { key: string; missing: number } | null;
  // Advisory only; operator must use the separate canonical rollout workflow.
  operatorReviewSuggested: boolean;
}

export interface PredictiveEvidencePlan {
  version: typeof PREDICTIVE_EVIDENCE_PLAN_VERSION;
  capabilities: Record<PredictiveCapability, PredictiveEvidencePlanItem>;
}

export function buildPredictiveEvidencePlan(input: {
  sourceAvailable: boolean;
  complete: boolean;
  captureHealth: PredictiveCaptureHealth;
  readiness: PredictiveReadinessEvaluation["capabilities"];
  calibration: PredictiveGraduationCalibration["capabilities"];
}): PredictiveEvidencePlan {
  const result = {} as Record<PredictiveCapability, PredictiveEvidencePlanItem>;
  for (const capability of ["ETA", "RUNWAY", "RUNWAY_CHANGE", "TRAJECTORY"] as const) {
    const ready = input.readiness[capability];
    const calibration = input.calibration[capability];
    const sortedGaps = [...calibration.evidenceDeficits].sort((a, b) => b.missing - a.missing);
    const truthBlocked = calibration.truthRequirements.some((requirement) => !requirement.available)
      || ready.reasons.some((reason) => reason.includes("truth_unavailable"));
    const action: PredictiveEvidenceAction =
      !input.sourceAvailable ? "DATA_UNAVAILABLE"
        : !input.complete ? "COLLECTION_TRUNCATED"
          : calibration.integrityBlockers.length > 0 ? "INVESTIGATE_IDENTITY"
            : !input.captureHealth.captureConfigured ? "CAPTURE_DISABLED"
              : input.captureHealth.perCapability[capability].recent24h === 0
                ? "CHECK_CAPTURE_ACTIVITY"
                : truthBlocked ? "OBTAIN_INDEPENDENT_TRUTH"
                  : calibration.evidenceDeficits.length > 0 ? "COLLECT_MORE_FLIGHTS"
                    : ready.decision === "FAIL" ? "INVESTIGATE_QUALITY"
                      : ready.decision === "PASS" && calibration.manualReviewEligible
                        ? "MANUAL_REVIEW" : "CONTINUE_MONITORING";
    result[capability] = {
      action,
      decision: ready.decision,
      blockerCount: ready.reasons.length,
      largestEvidenceGap: sortedGaps[0] ? { key: sortedGaps[0].key, missing: sortedGaps[0].missing } : null,
      operatorReviewSuggested: action === "MANUAL_REVIEW",
    };
  }
  return { version: PREDICTIVE_EVIDENCE_PLAN_VERSION, capabilities: result };
}
