import { describe, expect, it } from "vitest";
import { buildEtaPublicRolloutDecision } from "@/lib/predictive-intelligence/eta-rollout";
import type { PredictiveGraduationCapabilityCalibration } from "@/lib/predictive-intelligence/graduation-calibration";
import type { PredictiveReadinessCapabilityResult } from "@/lib/predictive-intelligence/readiness";

function readiness(decision: "PASS" | "WAIT" | "FAIL", reasons: string[] = []): PredictiveReadinessCapabilityResult<unknown> {
  return { capability: "ETA", decision, reasons, evidence: {} };
}

function calibration(overrides: Partial<PredictiveGraduationCapabilityCalibration> = {}): PredictiveGraduationCapabilityCalibration {
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

describe("ETA Public Rollout V1", () => {
  it("keeps PASS ETA in SHADOW until an explicit PUBLIC config change", () => {
    expect(buildEtaPublicRolloutDecision({
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
    expect(buildEtaPublicRolloutDecision({
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
    const reasons = ["eta.insufficient_independent_truth"];
    expect(buildEtaPublicRolloutDecision({
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
    const reasons = ["eta.insufficient_observations"];
    expect(buildEtaPublicRolloutDecision({
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

  it("keeps DISABLED explicit and never recommends a config change", () => {
    expect(buildEtaPublicRolloutDecision({
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
