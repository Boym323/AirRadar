import { describe, expect, it } from "vitest";
import {
  buildRegionalAttentionGraduation,
  REGIONAL_ATTENTION_GRADUATION_VERSION,
} from "@/lib/operational-twin/regional-attention-graduation";
import type { RegionalAttentionOutcomeReport } from "@/lib/operational-twin/regional-attention-outcome";

function outcome(overrides: Partial<RegionalAttentionOutcomeReport> = {}): RegionalAttentionOutcomeReport {
  return {
    version: "regional-attention-outcome-v1",
    generatedAt: "2026-10-05T18:00:00.000Z",
    decision: "PASS",
    reasons: [],
    complete: true,
    truthSource: "LOCAL_RECEIVER_PAIR_STATE",
    window: {
      from: "2026-10-05T14:00:00.000Z",
      to: "2026-10-05T18:00:00.000Z",
      spanMinutes: 240,
      bucketMinutes: 5,
      buckets: 48,
      restartStableAggregates: true,
    },
    overall: {
      predictions: 100,
      scoreable: 90,
      observed: 72,
      falsePositive: 18,
      precision: 0.8,
      expiredNoTruth: 10,
      missingTruthRate: 0.1,
      truthCoverage: 0.9,
      timingSamples: 72,
      meanAbsoluteTimingErrorSeconds: 120,
      observedDistanceSamples: 72,
      meanObservedDistanceNm: 5,
      observedVerticalSamples: 72,
      meanObservedVerticalFt: 1800,
    },
    horizonsMinutes: [5, 15, 30],
    horizons: {
      "5": { scoreable: 30 },
      "15": { scoreable: 30 },
      "30": { scoreable: 30 },
    },
    ...overrides,
  } as unknown as RegionalAttentionOutcomeReport;
}

describe("Regional Attention Graduation V1", () => {
  it("passes only when restart-stable outcome evidence clears graduation thresholds", () => {
    const report = buildRegionalAttentionGraduation(outcome());
    expect(report).toMatchObject({
      version: REGIONAL_ATTENTION_GRADUATION_VERSION,
      decision: "PASS",
      complete: true,
      manualPromotionEligible: true,
      autoPromotion: false,
      publicSemanticsRemainCanonical: true,
      destinationClusterEligible: false,
      collisionWarningEligible: false,
      separationProductEligible: false,
    });
  });

  it("waits while evidence volume is insufficient", () => {
    const report = buildRegionalAttentionGraduation(outcome({
      window: {
        from: "2026-10-05T17:00:00.000Z",
        to: "2026-10-05T18:00:00.000Z",
        spanMinutes: 60,
        bucketMinutes: 5,
        buckets: 12,
        restartStableAggregates: true,
      },
    }));
    expect(report.decision).toBe("WAIT");
    expect(report.reasons).toContain("span_insufficient");
    expect(report.manualPromotionEligible).toBe(false);
  });

  it("fails complete evidence that misses the stricter precision threshold", () => {
    const report = buildRegionalAttentionGraduation(outcome({
      overall: {
        ...outcome().overall,
        observed: 63,
        falsePositive: 27,
        precision: 0.7,
      },
    }));
    expect(report.decision).toBe("FAIL");
    expect(report.reasons).toContain("precision_below_graduation");
    expect(report.manualPromotionEligible).toBe(false);
  });
});
