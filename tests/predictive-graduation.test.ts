import { describe, expect, it } from "vitest";
import { getPredictiveGraduationPolicy, toPublicPredictiveState } from "@/lib/predictive-intelligence";
import type { PredictiveFlightState } from "@/lib/predictive-intelligence";

const prediction: PredictiveFlightState = {
  modelVersion: "predictive-intelligence-v1", evaluatedAt: 1_000,
  eta: { estimatedArrivalAt: 61_000, confidence: "HIGH", evidence: [] },
  runway: { runway: "24", alternative: "06", confidence: "MEDIUM", changed: false, evidence: [] },
  trajectory: { state: "NORMAL", confidence: "MEDIUM", evidence: [] },
};

describe("predictive graduation boundary", () => {
  it("keeps all capabilities shadow by default and omits them from public output", () => {
    expect(getPredictiveGraduationPolicy({})).toEqual({ ETA: "SHADOW", RUNWAY: "SHADOW", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "SHADOW" });
    expect(toPublicPredictiveState(prediction, getPredictiveGraduationPolicy({}), 2_000)).toEqual({ modelVersion: "predictive-intelligence-v1", evaluatedAt: "1970-01-01T00:00:01.000Z", freshness: "fresh" });
  });

  it("suppresses every stale public capability while preserving the overall stale marker", () => {
    const result = toPublicPredictiveState(prediction, {
      ETA: "PUBLIC",
      RUNWAY: "PUBLIC",
      RUNWAY_CHANGE: "PUBLIC",
      TRAJECTORY: "PUBLIC",
    }, 60_000);

    expect(result).toEqual({
      modelVersion: "predictive-intelligence-v1",
      evaluatedAt: "1970-01-01T00:00:01.000Z",
      freshness: "stale",
    });
  });

  it("does not expose an unknown-confidence runway as available", () => {
    const result = toPublicPredictiveState({
      ...prediction,
      runway: { ...prediction.runway, confidence: "UNKNOWN" },
    }, {
      ETA: "SHADOW",
      RUNWAY: "PUBLIC",
      RUNWAY_CHANGE: "SHADOW",
      TRAJECTORY: "SHADOW",
    }, 2_000);

    expect(result?.runway).toEqual({
      status: "unavailable",
      runway: null,
      confidence: "UNKNOWN",
    });
  });

  it("only exposes a runway change while it is fresh and confidence is known", () => {
    const result = toPublicPredictiveState({
      ...prediction,
      runway: { runway: "24", alternative: "18", changedFrom: "06", changedAt: 1_500, confidence: "MEDIUM", changed: true, evidence: [] },
    }, {
      ETA: "SHADOW",
      RUNWAY: "SHADOW",
      RUNWAY_CHANGE: "PUBLIC",
      TRAJECTORY: "SHADOW",
    }, 2_000);

    expect(result?.runwayChange).toEqual({
      status: "available",
      changedFrom: "06",
      runway: "24",
      confidence: "MEDIUM",
    });
  });
});
