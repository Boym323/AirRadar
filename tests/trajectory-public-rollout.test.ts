import { describe, expect, it } from "vitest";
import { buildTrajectoryPublicRolloutDecision } from "@/lib/predictive-intelligence/trajectory-rollout";
import type { PredictiveGraduationCapabilityCalibration } from "@/lib/predictive-intelligence/graduation-calibration";
import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";

function readiness(
  decision: "PASS" | "WAIT" | "FAIL",
  reasons: string[] = [],
): PredictiveReadinessCapabilityResult<unknown> {
  return { capability: "TRAJECTORY", decision, reasons, evidence: {} };
}

function calibration(
  overrides: Partial<PredictiveGraduationCapabilityCalibration> = {},
): PredictiveGraduationCapabilityCalibration {
  return {
    capability: "TRAJECTORY",
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

describe("Trajectory Public Rollout V1", () => {
  it("stays SHADOW while outcome truth is unavailable", () => {
    const reason = "trajectory.independent_outcome_truth_unavailable";
    expect(buildTrajectoryPublicRolloutDecision({
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

  it("requires an explicit config change after PASS", () => {
    expect(buildTrajectoryPublicRolloutDecision({
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

  it("reports PUBLIC active only while the effective gate remains PUBLIC", () => {
    expect(buildTrajectoryPublicRolloutDecision({
      configuredMode: "PUBLIC",
      effectiveMode: "PUBLIC",
      readiness: readiness("PASS"),
      calibration: calibration(),
    })).toMatchObject({
      state: "PUBLIC_ACTIVE",
      publicActive: true,
      blockers: [],
    });
  });
});
