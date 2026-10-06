import { describe, expect, it } from "vitest";
import { explainablePredictionEvidence } from "@/lib/predictive-intelligence/explainability";

describe("Explainable Prediction V1 evidence contract", () => {
  it("publishes only capability-specific whitelisted evidence", () => {
    expect(explainablePredictionEvidence("ETA", [
      { key: "distanceRemainingNm", value: 84.3 },
      { key: "effectiveSpeedKt", value: 412 },
      { key: "phase", value: "DESCENT" },
      { key: "internalScore", value: 0.91 },
      { key: "reason", value: "internal diagnostic" },
    ])).toEqual([
      { key: "distanceRemainingNm", value: 84.3 },
      { key: "effectiveSpeedKt", value: 412 },
      { key: "phase", value: "DESCENT" },
    ]);

    expect(explainablePredictionEvidence("RUNWAY", [
      { key: "recentRunwayUsage", value: "8" },
      { key: "surfaceWind", value: "250/11kt" },
      { key: "candidateMargin", value: 0.18 },
      { key: "crossTrackKm", value: 3.2 },
    ])).toEqual([
      { key: "recentRunwayUsage", value: "8" },
      { key: "surfaceWind", value: "250/11kt" },
      { key: "candidateMargin", value: 0.18 },
    ]);
  });

  it("fails closed on invalid values and caps evidence", () => {
    const evidence = Array.from({ length: 10 }, (_, index) => ({
      key: index % 2 === 0 ? "crossTrackKm" : "distanceChangeKm",
      value: index,
    }));
    expect(explainablePredictionEvidence("TRAJECTORY", evidence)).toHaveLength(6);
    expect(explainablePredictionEvidence("TRAJECTORY", [
      { key: "crossTrackKm", value: Number.NaN },
      { key: "distanceChangeKm", value: Number.POSITIVE_INFINITY },
      { key: "unknown", value: "secret" },
    ])).toEqual([]);
  });

  it("sanitizes string values", () => {
    expect(explainablePredictionEvidence("RUNWAY_CHANGE", [
      { key: "surfaceWind", value: " 250/11kt\ninternal " },
    ])).toEqual([{ key: "surfaceWind", value: "250/11kt internal" }]);
  });
});
