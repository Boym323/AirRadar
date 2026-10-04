import { describe, expect, it } from "vitest";
import { buildPredictivePublicRolloutDecision } from "@/lib/predictive-intelligence/public-rollout";
import type { PredictiveGraduationCapabilityCalibration } from "@/lib/predictive-intelligence/graduation-calibration";
import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";

function readiness(
  decision: "PASS" | "WAIT" | "FAIL",
  reasons: string[] = [],
): PredictiveReadinessCapabilityResult<unknown> {
  return { capability: "ETA", decision, reasons, evidence: {} };
}

function calibration(
  overrides: Partial<PredictiveGraduationCapabilityCalibration> = {},
): PredictiveGraduationCapabilityCalibration {
  return {
    capability: "ETA",
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

describe("Predictive Public Rollout engine", () => {
  it("requires an explicit config change after PASS in SHADOW", () => {
    expect(buildPredictivePublicRolloutDecision({
      version: "test-rollout-v1",
      configuredMode: "SHADOW",
      effectiveMode: "SHADOW",
      readiness: readiness("PASS"),
      calibration: calibration(),
    })).toMatchObject({
      version: "test-rollout-v1",
      state: "READY_FOR_PUBLIC_CONFIG",
      publicActive: false,
      requiresExplicitConfigChange: true,
      blockers: [],
    });
  });

  it("activates PUBLIC only with effective PUBLIC and PASS", () => {
    expect(buildPredictivePublicRolloutDecision({
      version: "test-rollout-v1",
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

  it("fails closed when configured PUBLIC no longer remains effective", () => {
    const reasons = ["collection.bounded_result_incomplete", "integrity.cross_icao_lifecycle_conflict"];
    expect(buildPredictivePublicRolloutDecision({
      version: "test-rollout-v1",
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
    })).toMatchObject({
      state: "PUBLIC_FAIL_CLOSED",
      publicActive: false,
      blockers: reasons,
    });
  });

  it("deduplicates blockers across calibration buckets", () => {
    const reason = "collection.bounded_result_incomplete";
    const result = buildPredictivePublicRolloutDecision({
      version: "test-rollout-v1",
      configuredMode: "SHADOW",
      effectiveMode: "SHADOW",
      readiness: readiness("WAIT", [reason]),
      calibration: calibration({
        decision: "WAIT",
        phase: "COLLECTION_BLOCKED",
        manualReviewEligible: false,
        collectionBlockers: [reason],
        readinessReasons: [reason],
      }),
    });

    expect(result.blockers).toEqual([reason]);
  });

  it("keeps DISABLED explicit", () => {
    expect(buildPredictivePublicRolloutDecision({
      version: "test-rollout-v1",
      configuredMode: "DISABLED",
      effectiveMode: "DISABLED",
      readiness: readiness("PASS"),
      calibration: calibration(),
    })).toMatchObject({
      state: "DISABLED",
      publicActive: false,
      requiresExplicitConfigChange: false,
      manualReviewEligible: false,
    });
  });
});
