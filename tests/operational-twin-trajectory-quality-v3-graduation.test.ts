import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS,
  buildOperationalTwinTrajectoryQualityV3Graduation,
  type OperationalTwinTrajectoryQualityOutcomeV2Report,
  type OperationalTwinTrajectoryQualityOutcomeV2Slice,
} from "@/lib/operational-twin";

function slice(
  overrides: Partial<OperationalTwinTrajectoryQualityOutcomeV2Slice> = {},
): OperationalTwinTrajectoryQualityOutcomeV2Slice {
  return {
    pairedSamples: 40,
    canonicalMeanAbsoluteErrorFt: 2000,
    v2MeanAbsoluteErrorFt: 1500,
    v3MeanAbsoluteErrorFt: 1350,
    v2RelativeMaeImprovementVsCanonical: 0.25,
    v3RelativeMaeImprovementVsCanonical: 0.325,
    v3RelativeMaeImprovementVsV2: 0.10,
    v2WinsCanonical: 25,
    canonicalWinsV2: 15,
    v2CanonicalTies: 0,
    v2WinRateVsCanonical: 0.625,
    v3WinsCanonical: 27,
    canonicalWinsV3: 13,
    v3CanonicalTies: 0,
    v3WinRateVsCanonical: 0.675,
    v3WinsV2: 23,
    v2WinsV3: 17,
    v3V2Ties: 0,
    v3WinRateVsV2: 0.575,
    bestMeanAbsoluteErrorModel: "TRAJECTORY_QUALITY_V3",
    ...overrides,
  };
}

function report(
  overrides: Partial<OperationalTwinTrajectoryQualityOutcomeV2Report> = {},
): OperationalTwinTrajectoryQualityOutcomeV2Report {
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
  const performanceClasses = {
    JET: slice({ pairedSamples: 60 }),
    TURBOPROP: slice({ pairedSamples: 25 }),
    PISTON: slice({ pairedSamples: 15 }),
    ROTORCRAFT: slice({ pairedSamples: 10 }),
    UNKNOWN: slice({ pairedSamples: 10 }),
  };
  const v3Profiles = {
    SELECTED_ALTITUDE_CAPTURE: slice({ pairedSamples: 45 }),
    PERFORMANCE_TAPERED: slice({ pairedSamples: 35 }),
    ALTITUDE_HOLD: slice({ pairedSamples: 25 }),
    V2_FALLBACK: slice({ pairedSamples: 15, v2MeanAbsoluteErrorFt: 1400, v3MeanAbsoluteErrorFt: 1400, v3RelativeMaeImprovementVsV2: 0, v3WinsV2: 0, v2WinsV3: 0, v3V2Ties: 15, v3WinRateVsV2: null, bestMeanAbsoluteErrorModel: "TIE" }),
    UNAVAILABLE: slice({ pairedSamples: 0, canonicalMeanAbsoluteErrorFt: null, v2MeanAbsoluteErrorFt: null, v3MeanAbsoluteErrorFt: null, v2RelativeMaeImprovementVsCanonical: null, v3RelativeMaeImprovementVsCanonical: null, v3RelativeMaeImprovementVsV2: null, v2WinsCanonical: 0, canonicalWinsV2: 0, v2CanonicalTies: 0, v2WinRateVsCanonical: null, v3WinsCanonical: 0, canonicalWinsV3: 0, v3CanonicalTies: 0, v3WinRateVsCanonical: null, v3WinsV2: 0, v2WinsV3: 0, v3V2Ties: 0, v3WinRateVsV2: null, bestMeanAbsoluteErrorModel: null }),
  };

  return {
    version: "operational-digital-twin-trajectory-quality-outcome-v2",
    generatedAt: "2026-10-06T16:00:00.000Z",
    decision: "PASS",
    reasons: [],
    complete: true,
    thresholds: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS,
    truthSource: "LOCAL_RECEIVER",
    comparisonModels: ["CANONICAL", "TRAJECTORY_QUALITY_V2", "TRAJECTORY_QUALITY_V3"],
    requestDrivenCapture: true,
    refreshDrivenTruthSampling: true,
    shadowOnly: true,
    changesPromotionPolicy: false,
    horizonsMinutes: [5, 15, 30],
    window: {
      from: "2026-10-06T12:00:00.000Z",
      to: "2026-10-06T16:00:00.000Z",
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
    v3UnavailableCaptureSkips: 0,
    capacityEvictions: 0,
    overall: slice({ pairedSamples: 120 }),
    horizons,
    phases,
    performanceClasses,
    v3Profiles,
    limitations: [
      "OUTCOME_MEASUREMENT_ONLY",
      "NO_AUTO_GRADUATION",
      "NO_PROMOTION_CHANGE",
      "LOCAL_RECEIVER_TRUTH_ONLY",
      "RESTART_STABLE_AGGREGATES",
      "TRIPLE_PAIRED_SAMPLES_ONLY",
    ],
    ...overrides,
  };
}

describe("Trajectory Quality V3 Graduation V1", () => {
  it("waits for the stricter V3 evidence floor", () => {
    const graduation = buildOperationalTwinTrajectoryQualityV3Graduation(report({
      window: {
        from: "2026-10-06T14:00:00.000Z",
        to: "2026-10-06T16:00:00.000Z",
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

  it("passes when V3 materially beats both V2 and canonical without guarded regressions", () => {
    const graduation = buildOperationalTwinTrajectoryQualityV3Graduation(report());

    expect(graduation.decision).toBe("PASS");
    expect(graduation.complete).toBe(true);
    expect(graduation.manualPromotionEligible).toBe(true);
    expect(graduation.autoPromotion).toBe(false);
    expect(graduation.v3PromotionImplemented).toBe(false);
    expect(graduation.v2PromotionRemainsIndependent).toBe(true);
    expect(graduation.evidence.bestMeanAbsoluteErrorModel).toBe("TRAJECTORY_QUALITY_V3");
    expect(graduation.evidence.horizonRegressions).toEqual([]);
    expect(graduation.evidence.phaseRegressions).toEqual([]);
    expect(graduation.evidence.performanceClassRegressions).toEqual([]);
    expect(graduation.evidence.v3ProfileRegressions).toEqual([]);
  });

  it("fails when V3 aggregate benefit versus V2 is too small", () => {
    const graduation = buildOperationalTwinTrajectoryQualityV3Graduation(report({
      overall: slice({
        pairedSamples: 120,
        v3MeanAbsoluteErrorFt: 1470,
        v3RelativeMaeImprovementVsV2: 0.02,
        v3WinsV2: 21,
        v2WinsV3: 19,
        v3WinRateVsV2: 0.525,
      }),
    }));

    expect(graduation.decision).toBe("FAIL");
    expect(graduation.manualPromotionEligible).toBe(false);
    expect(graduation.reasons).toEqual(expect.arrayContaining([
      "v3_relative_mae_improvement_vs_v2_below_graduation",
      "v3_win_rate_vs_v2_below_graduation",
    ]));
  });

  it("fails if V3 beats V2 but does not materially beat canonical", () => {
    const graduation = buildOperationalTwinTrajectoryQualityV3Graduation(report({
      overall: slice({
        pairedSamples: 120,
        canonicalMeanAbsoluteErrorFt: 1500,
        v2MeanAbsoluteErrorFt: 1450,
        v3MeanAbsoluteErrorFt: 1350,
        v3RelativeMaeImprovementVsV2: 0.069,
        v3RelativeMaeImprovementVsCanonical: 0.10,
      }),
    }));

    expect(graduation.decision).toBe("PASS");

    const insufficientCanonicalGain = buildOperationalTwinTrajectoryQualityV3Graduation(report({
      overall: slice({
        pairedSamples: 120,
        canonicalMeanAbsoluteErrorFt: 1450,
        v2MeanAbsoluteErrorFt: 1500,
        v3MeanAbsoluteErrorFt: 1400,
        v3RelativeMaeImprovementVsV2: 0.0667,
        v3RelativeMaeImprovementVsCanonical: 0.0345,
      }),
    }));

    expect(insufficientCanonicalGain.decision).toBe("FAIL");
    expect(insufficientCanonicalGain.reasons).toContain(
      "v3_relative_mae_improvement_vs_canonical_below_graduation",
    );
  });

  it("fails closed on a material horizon regression versus V2", () => {
    const base = report();
    const graduation = buildOperationalTwinTrajectoryQualityV3Graduation({
      ...base,
      horizons: {
        ...base.horizons,
        "30": slice({
          pairedSamples: 40,
          v2MeanAbsoluteErrorFt: 1500,
          v3MeanAbsoluteErrorFt: 1600,
          v3RelativeMaeImprovementVsV2: -0.0667,
          v3WinsV2: 16,
          v2WinsV3: 24,
          v3WinRateVsV2: 0.4,
          bestMeanAbsoluteErrorModel: "TRAJECTORY_QUALITY_V2",
        }),
      },
    });

    expect(graduation.decision).toBe("FAIL");
    expect(graduation.reasons).toContain("v3_horizon_regression_vs_v2");
    expect(graduation.evidence.horizonRegressions.map((item) => item.key)).toContain("30");
  });

  it("guards represented phase, performance and V3-profile segments while ignoring sparse noise", () => {
    const base = report();
    const sparse = buildOperationalTwinTrajectoryQualityV3Graduation({
      ...base,
      performanceClasses: {
        ...base.performanceClasses,
        ROTORCRAFT: slice({
          pairedSamples: 5,
          v2MeanAbsoluteErrorFt: 1000,
          v3MeanAbsoluteErrorFt: 1400,
          v3RelativeMaeImprovementVsV2: -0.4,
        }),
      },
    });
    expect(sparse.decision).toBe("PASS");

    const represented = buildOperationalTwinTrajectoryQualityV3Graduation({
      ...base,
      phases: {
        ...base.phases,
        DESCENT: slice({
          pairedSamples: 30,
          v2MeanAbsoluteErrorFt: 1000,
          v3MeanAbsoluteErrorFt: 1100,
          v3RelativeMaeImprovementVsV2: -0.1,
        }),
      },
      performanceClasses: {
        ...base.performanceClasses,
        JET: slice({
          pairedSamples: 60,
          v2MeanAbsoluteErrorFt: 1000,
          v3MeanAbsoluteErrorFt: 1100,
          v3RelativeMaeImprovementVsV2: -0.1,
        }),
      },
      v3Profiles: {
        ...base.v3Profiles,
        SELECTED_ALTITUDE_CAPTURE: slice({
          pairedSamples: 45,
          v2MeanAbsoluteErrorFt: 1000,
          v3MeanAbsoluteErrorFt: 1100,
          v3RelativeMaeImprovementVsV2: -0.1,
        }),
      },
    });

    expect(represented.decision).toBe("FAIL");
    expect(represented.reasons).toEqual(expect.arrayContaining([
      "v3_phase_regression_vs_v2",
      "v3_performance_class_regression_vs_v2",
      "v3_profile_regression_vs_v2",
    ]));
    expect(represented.evidence.phaseRegressions.map((item) => item.key)).toContain("DESCENT");
    expect(represented.evidence.performanceClassRegressions.map((item) => item.key)).toContain("JET");
    expect(represented.evidence.v3ProfileRegressions.map((item) => item.key)).toContain("SELECTED_ALTITUDE_CAPTURE");
  });
});
