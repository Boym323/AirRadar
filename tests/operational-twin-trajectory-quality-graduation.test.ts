import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS,
  buildOperationalTwinTrajectoryQualityGraduation,
  type OperationalTwinTrajectoryQualityOutcomeReport,
  type OperationalTwinTrajectoryQualityOutcomeSlice,
} from "@/lib/operational-twin";

function slice(input: Partial<OperationalTwinTrajectoryQualityOutcomeSlice> = {}): OperationalTwinTrajectoryQualityOutcomeSlice {
  return {
    pairedSamples: 40,
    canonicalMeanAbsoluteErrorFt: 2000,
    qualityMeanAbsoluteErrorFt: 1600,
    meanImprovementFt: 400,
    relativeMaeImprovement: 0.20,
    qualityWins: 26,
    canonicalWins: 14,
    ties: 0,
    qualityWinRate: 0.65,
    ...input,
  };
}

function report(
  overrides: Partial<OperationalTwinTrajectoryQualityOutcomeReport> = {},
): OperationalTwinTrajectoryQualityOutcomeReport {
  const horizons = {
    "5": slice(),
    "15": slice(),
    "30": slice(),
  };
  const phases = {
    CLIMB: slice({ pairedSamples: 30 }),
    CRUISE: slice({ pairedSamples: 30 }),
    DESCENT: slice({ pairedSamples: 30 }),
    LEVEL: slice({ pairedSamples: 20 }),
    UNKNOWN: slice({ pairedSamples: 10 }),
  };

  return {
    version: "operational-digital-twin-trajectory-quality-outcome-v1",
    generatedAt: "2026-10-06T12:00:00.000Z",
    decision: "PASS",
    reasons: [],
    complete: true,
    thresholds: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS,
    truthSource: "LOCAL_RECEIVER",
    requestDrivenCapture: true,
    refreshDrivenTruthSampling: true,
    canonicalRemainsActive: true,
    autoPromotion: false,
    horizonsMinutes: [5, 15, 30],
    window: {
      from: "2026-10-06T08:00:00.000Z",
      to: "2026-10-06T12:00:00.000Z",
      spanMinutes: 240,
      bucketMinutes: 5,
      buckets: 48,
      restartStableAggregates: true,
    },
    pending: 0,
    created: 130,
    completed: 120,
    expiredWithoutTruth: 10,
    truthCoverage: 0.9231,
    duplicateCaptureSkips: 0,
    capacityEvictions: 0,
    overall: slice({ pairedSamples: 120 }),
    horizons,
    phases,
    limitations: [
      "OUTCOME_MEASUREMENT_ONLY",
      "NO_AUTO_PROMOTION",
      "LOCAL_RECEIVER_TRUTH_ONLY",
      "RESTART_STABLE_AGGREGATES",
    ],
    ...overrides,
  };
}

describe("Trajectory Quality Graduation V1", () => {
  it("waits for the stricter graduation evidence floor", () => {
    const graduation = buildOperationalTwinTrajectoryQualityGraduation(report({
      window: {
        from: "2026-10-06T10:00:00.000Z",
        to: "2026-10-06T12:00:00.000Z",
        spanMinutes: 120,
        bucketMinutes: 5,
        buckets: 24,
        restartStableAggregates: true,
      },
      overall: slice({ pairedSamples: 60 }),
      horizons: {
        "5": slice({ pairedSamples: 20 }),
        "15": slice({ pairedSamples: 20 }),
        "30": slice({ pairedSamples: 20 }),
      },
    }));

    expect(graduation.decision).toBe("WAIT");
    expect(graduation.complete).toBe(false);
    expect(graduation.manualPromotionEligible).toBe(false);
    expect(graduation.reasons).toEqual(expect.arrayContaining([
      "span_insufficient",
      "paired_samples_insufficient",
      "horizon_samples_insufficient",
    ]));
  });

  it("passes only when V2 has material aggregate benefit and no guarded regressions", () => {
    const graduation = buildOperationalTwinTrajectoryQualityGraduation(report());

    expect(graduation.decision).toBe("PASS");
    expect(graduation.complete).toBe(true);
    expect(graduation.manualPromotionEligible).toBe(true);
    expect(graduation.autoPromotion).toBe(false);
    expect(graduation.canonicalTrajectoryRemainsActive).toBe(true);
    expect(graduation.evidence.horizonRegressions).toEqual([]);
    expect(graduation.evidence.phaseRegressions).toEqual([]);
  });

  it("fails when aggregate benefit is below the graduation quality gates", () => {
    const graduation = buildOperationalTwinTrajectoryQualityGraduation(report({
      overall: slice({
        pairedSamples: 120,
        qualityMeanAbsoluteErrorFt: 1900,
        meanImprovementFt: 100,
        relativeMaeImprovement: 0.05,
        qualityWins: 22,
        canonicalWins: 18,
        qualityWinRate: 0.55,
      }),
    }));

    expect(graduation.decision).toBe("FAIL");
    expect(graduation.manualPromotionEligible).toBe(false);
    expect(graduation.reasons).toEqual(expect.arrayContaining([
      "relative_mae_improvement_below_graduation",
      "quality_win_rate_below_graduation",
    ]));
  });

  it("fails closed on a material horizon regression even when aggregate metrics pass", () => {
    const base = report();
    const graduation = buildOperationalTwinTrajectoryQualityGraduation({
      ...base,
      horizons: {
        ...base.horizons,
        "30": slice({
          pairedSamples: 40,
          canonicalMeanAbsoluteErrorFt: 2000,
          qualityMeanAbsoluteErrorFt: 2200,
          meanImprovementFt: -200,
          relativeMaeImprovement: -0.10,
          qualityWins: 15,
          canonicalWins: 25,
          qualityWinRate: 0.375,
        }),
      },
    });

    expect(graduation.decision).toBe("FAIL");
    expect(graduation.reasons).toContain("horizon_regression");
    expect(graduation.evidence.horizonRegressions.map((item) => item.key)).toContain("30");
  });

  it("guards represented flight phases but ignores sparse phase noise", () => {
    const base = report();
    const sparse = buildOperationalTwinTrajectoryQualityGraduation({
      ...base,
      phases: {
        ...base.phases,
        UNKNOWN: slice({
          pairedSamples: 5,
          canonicalMeanAbsoluteErrorFt: 1000,
          qualityMeanAbsoluteErrorFt: 1400,
          meanImprovementFt: -400,
          relativeMaeImprovement: -0.4,
        }),
      },
    });
    expect(sparse.decision).toBe("PASS");

    const represented = buildOperationalTwinTrajectoryQualityGraduation({
      ...base,
      phases: {
        ...base.phases,
        DESCENT: slice({
          pairedSamples: 30,
          canonicalMeanAbsoluteErrorFt: 1000,
          qualityMeanAbsoluteErrorFt: 1200,
          meanImprovementFt: -200,
          relativeMaeImprovement: -0.2,
        }),
      },
    });
    expect(represented.decision).toBe("FAIL");
    expect(represented.reasons).toContain("phase_regression");
    expect(represented.evidence.phaseRegressions.map((item) => item.key)).toContain("DESCENT");
  });
});
