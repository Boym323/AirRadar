import { describe, expect, it } from "vitest";
import { buildOperationalFocusOutcomeReport } from "@/lib/operational-twin/operational-focus-outcome";
import type { OperationalTwinEventOutcomeReport, OperationalTwinEventOutcomeSlice } from "@/lib/operational-twin/event-outcome";

function slice(overrides: Partial<OperationalTwinEventOutcomeSlice> = {}): OperationalTwinEventOutcomeSlice {
  return {
    predictions: 0,
    scoreable: 0,
    observed: 0,
    falsePositive: 0,
    precision: null,
    expiredNoTruth: 0,
    unscoreableTruth: 0,
    missingTruthRate: null,
    timingSamples: 0,
    meanSignedTimingErrorSeconds: null,
    meanAbsoluteTimingErrorSeconds: null,
    within120Seconds: 0,
    within120SecondsRate: null,
    within300Seconds: 0,
    within300SecondsRate: null,
    ...overrides,
  };
}

function report(sigmet: OperationalTwinEventOutcomeSlice): OperationalTwinEventOutcomeReport {
  return {
    version: "operational-digital-twin-event-outcome-v2",
    generatedAt: "2026-10-06T09:00:00.000Z",
    decision: "WAIT",
    reasons: [],
    complete: false,
    thresholds: {
      version: "operational-digital-twin-event-outcome-v2",
      minimumSpanMinutes: 120,
      minimumScoreableSamples: 60,
      minimumObservedTimingSamples: 30,
      minimumEventTypesWithEvidence: 2,
      minimumScoreablePerRepresentedType: 10,
      minimumPrecision: 0.7,
      maximumMeanAbsoluteTimingErrorSeconds: 240,
      maximumMissingTruthRate: 0.4,
    },
    truthSources: ["LOCAL_RECEIVER", "FLIGHT_INTELLIGENCE"],
    requestDrivenCapture: true,
    refreshDrivenSampling: true,
    supportedTypes: ["WAYPOINT", "ATC_SECTOR_ENTRY", "SIGMET_INTERSECTION", "ARRIVAL_ETA", "RUNWAY_EXPECTATION"],
    recallMeasured: false,
    window: { from: "2026-10-06T07:00:00.000Z", to: "2026-10-06T09:00:00.000Z", spanMinutes: 120, bucketMinutes: 5, buckets: 24, processLocal: true },
    pending: 0,
    duplicateCaptureSkips: 0,
    capacityEvictions: 0,
    overall: sigmet,
    byType: {
      WAYPOINT: slice(),
      ATC_SECTOR_ENTRY: slice(),
      SIGMET_INTERSECTION: sigmet,
      ARRIVAL_ETA: slice(),
      RUNWAY_EXPECTATION: slice(),
    },
    byLeadMinutes: { "0_5": slice(), "5_15": slice(), "15_30": slice() },
    windTimingGraduation: {
      version: "operational-digital-twin-wind-timing-graduation-v1",
      decision: "WAIT",
      reasons: ["paired_samples_insufficient"],
      complete: false,
      thresholds: {
        version: "operational-digital-twin-wind-timing-graduation-v1",
        minimumSpanMinutes: 120,
        minimumPairedSamples: 30,
        minimumMeaningfulAdjustments: 20,
        meaningfulAdjustmentSeconds: 30,
        minimumTruthCoverage: 0.6,
        minimumShadowWinRate: 0.55,
        regressionShadowWinRate: 0.45,
        minimumRelativeMaeImprovement: 0.05,
        regressionRelativeMaeImprovement: -0.05,
        tieToleranceSeconds: 5,
      },
      scope: "WAYPOINT_TIMING_ONLY",
      truthSource: "EVENT_OUTCOME_V2_LOCAL_WAYPOINT_TRUTH",
      autoPromotion: false,
      manualPromotionEligible: false,
      canonicalTimingRemainsActive: true,
      eligiblePredictions: 0,
      resolvedPredictions: 0,
      pendingEligible: 0,
      pairedSamples: 0,
      unpairedResolutions: 0,
      truthCoverage: null,
      meaningfulAdjustments: 0,
      canonicalMeanAbsoluteTimingErrorSeconds: null,
      shadowMeanAbsoluteTimingErrorSeconds: null,
      meanImprovementSeconds: null,
      relativeMaeImprovement: null,
      shadowWins: 0,
      canonicalWins: 0,
      ties: 0,
      shadowWinRate: null,
      meanAbsoluteAdjustmentSeconds: null,
    },
  };
}

describe("Operational Focus Outcome Validation V1", () => {
  it("maps independent SIGMET outcome truth into WEATHER focus quality", () => {
    const result = buildOperationalFocusOutcomeReport(report(slice({
      predictions: 25,
      scoreable: 20,
      observed: 16,
      falsePositive: 4,
      precision: 0.8,
      expiredNoTruth: 2,
      missingTruthRate: 0.1,
      timingSamples: 14,
      meanAbsoluteTimingErrorSeconds: 150,
    })));
    expect(result.decision).toBe("PASS");
    expect(result.byType.WEATHER.availability).toBe("AVAILABLE");
    expect(result.byType.WEATHER.precision).toBe(0.8);
  });

  it("keeps focus types without independent truth explicitly unavailable", () => {
    const result = buildOperationalFocusOutcomeReport(report(slice()));
    expect(result.decision).toBe("WAIT");
    expect(result.byType.NAVIGATION_INTEGRITY.availability).toBe("UNAVAILABLE");
    expect(result.byType.PLANNED_AIRSPACE.availability).toBe("UNAVAILABLE");
    expect(result.byType.TRAJECTORY.availability).toBe("UNAVAILABLE");
    expect(result.limitations).toContain("NO_FOCUS_SELF_VALIDATION");
  });
});
