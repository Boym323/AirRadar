import { describe, expect, it } from "vitest";
import { buildRunwayChangePublicRolloutDecision } from "@/lib/predictive-intelligence/runway-change-rollout";
import type { PredictiveGraduationCapabilityCalibration } from "@/lib/predictive-intelligence/graduation-calibration";
import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";

function readiness(
  decision: "PASS" | "WAIT" | "FAIL",
  reasons: string[] = [],
): PredictiveReadinessCapabilityResult<unknown> {
  return { capability: "RUNWAY_CHANGE", decision, reasons, evidence: {} };
}

function calibration(
  overrides: Partial<PredictiveGraduationCapabilityCalibration> = {},
): PredictiveGraduationCapabilityCalibration {
  return {
    capability: "RUNWAY_CHANGE",
    decision: "PASS",
    phase: "READY",
    manualReviewEligible: true,
    qualityEvaluated: true,
    evidenceDeficits: [],
    truthRequirements: [],
    qualityMargins: [],
    integrityBlockers: [],
    collectionBlockers: [],
    readinessReasons: [],
    ...overrides,
  };
}

describe("Runway Change Public Rollout V1", () => {
  it("stays SHADOW until manual review is eligible", () => {
    const reason = "runway_change.independent_truth_unavailable";
    expect(buildRunwayChangePublicRolloutDecision({
      configuredMode: "SHADOW",
      effectiveMode: "SHADOW",
      readiness: readiness("WAIT", [reason]),
      calibration: calibration({
        decision: "WAIT",
        phase: "TRUTH_BLOCKED",
        manualReviewEligible: false,
        readinessReasons: [reason],
      }),
    })).toMatchObject({
      state: "SHADOW_COLLECTING",
      publicActive: false,
      requiresExplicitConfigChange: false,
      blockers: [reason],
    });
  });

  it("becomes ready for explicit PUBLIC configuration after PASS", () => {
    expect(buildRunwayChangePublicRolloutDecision({
      configuredMode: "SHADOW",
      effectiveMode: "SHADOW",
      readiness: readiness("PASS"),
      calibration: calibration(),
    })).toMatchObject({
      state: "READY_FOR_PUBLIC_CONFIG",
      publicActive: false,
      requiresExplicitConfigChange: true,
      blockers: [],
    });
  });

  it("fails closed after PUBLIC readiness regression", () => {
    const reason = "runway_change.false_positive_rate_above_threshold";
    expect(buildRunwayChangePublicRolloutDecision({
      configuredMode: "PUBLIC",
      effectiveMode: "SHADOW",
      readiness: readiness("FAIL", [reason]),
      calibration: calibration({
        decision: "FAIL",
        phase: "QUALITY_BLOCKED",
        manualReviewEligible: false,
        readinessReasons: [reason],
      }),
    })).toMatchObject({
      state: "PUBLIC_FAIL_CLOSED",
      publicActive: false,
      blockers: [reason],
    });
  });
});
