import { describe, expect, it } from "vitest";
import { buildRunwayPublicRolloutDecision } from "@/lib/predictive-intelligence/runway-rollout";
import type { PredictiveGraduationCapabilityCalibration } from "@/lib/predictive-intelligence/graduation-calibration";
import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";

function readiness(decision: "PASS" | "WAIT" | "FAIL", reasons: string[] = []): PredictiveReadinessCapabilityResult<unknown> {
  return { capability: "RUNWAY", decision, reasons, evidence: {} };
}

function calibration(overrides: Partial<PredictiveGraduationCapabilityCalibration> = {}): PredictiveGraduationCapabilityCalibration {
  return {
    capability: "RUNWAY",
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

describe("Runway Public Rollout V1", () => {
  it("keeps PASS Runway in SHADOW until an explicit PUBLIC config change", () => {
    expect(buildRunwayPublicRolloutDecision({
      configuredMode: "SHADOW",
      effectiveMode: "SHADOW",
      readiness: readiness("PASS"),
      calibration: calibration(),
    })).toMatchObject({
      state: "READY_FOR_PUBLIC_CONFIG",
      manualReviewEligible: true,
      publicActive: false,
      requiresExplicitConfigChange: true,
      blockers: [],
    });
  });

  it("reports PUBLIC active only when configured PUBLIC and readiness remains PASS", () => {
    expect(buildRunwayPublicRolloutDecision({
      configuredMode: "PUBLIC",
      effectiveMode: "PUBLIC",
      readiness: readiness("PASS"),
      calibration: calibration(),
    })).toMatchObject({
      state: "PUBLIC_ACTIVE",
      publicActive: true,
      requiresExplicitConfigChange: false,
      blockers: [],
    });
  });

  it("fails closed when PUBLIC is configured but readiness falls back to WAIT", () => {
    const reasons = ["runway.insufficient_independent_truth"];
    expect(buildRunwayPublicRolloutDecision({
      configuredMode: "PUBLIC",
      effectiveMode: "SHADOW",
      readiness: readiness("WAIT", reasons),
      calibration: calibration({
        decision: "WAIT",
        phase: "COLLECTING",
        manualReviewEligible: false,
        qualityEvaluated: false,
        readinessReasons: reasons,
      }),
    })).toMatchObject({
      state: "PUBLIC_FAIL_CLOSED",
      publicActive: false,
      blockers: reasons,
    });
  });

  it("does not recommend PUBLIC while SHADOW evidence is still collecting", () => {
    const reasons = ["runway.insufficient_scoreable_observations"];
    expect(buildRunwayPublicRolloutDecision({
      configuredMode: "SHADOW",
      effectiveMode: "SHADOW",
      readiness: readiness("WAIT", reasons),
      calibration: calibration({
        decision: "WAIT",
        phase: "COLLECTING",
        manualReviewEligible: false,
        qualityEvaluated: false,
        readinessReasons: reasons,
      }),
    })).toMatchObject({
      state: "SHADOW_COLLECTING",
      publicActive: false,
      requiresExplicitConfigChange: false,
      blockers: reasons,
    });
  });

  it("preserves integrity and collection blockers without duplicates", () => {
    const reasons = ["collection.bounded_result_incomplete", "integrity.cross_icao_lifecycle_conflict"];
    const result = buildRunwayPublicRolloutDecision({
      configuredMode: "PUBLIC",
      effectiveMode: "SHADOW",
      readiness: readiness("FAIL", reasons),
      calibration: calibration({
        decision: "FAIL",
        phase: "HARD_BLOCKED",
        manualReviewEligible: false,
        collectionBlockers: [reasons[0]],
        integrityBlockers: [reasons[1]],
        readinessReasons: reasons,
      }),
    });
    expect(result.state).toBe("PUBLIC_FAIL_CLOSED");
    expect(result.blockers).toEqual(reasons);
  });

  it("keeps DISABLED explicit and never recommends a config change", () => {
    expect(buildRunwayPublicRolloutDecision({
      configuredMode: "DISABLED",
      effectiveMode: "DISABLED",
      readiness: readiness("PASS"),
      calibration: calibration(),
    })).toMatchObject({
      state: "DISABLED",
      publicActive: false,
      requiresExplicitConfigChange: false,
    });
  });
});
