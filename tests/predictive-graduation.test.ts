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

  it("suppresses stale ETA while preserving the overall stale prediction marker", () => {
    const result = toPublicPredictiveState(prediction, { ETA: "PUBLIC", RUNWAY: "DISABLED", RUNWAY_CHANGE: "SHADOW", TRAJECTORY: "PUBLIC" }, 60_000);
    expect(result).toMatchObject({ freshness: "stale", trajectory: { state: "NORMAL" } });
    expect(result).not.toHaveProperty("eta");
    expect(result).not.toHaveProperty("runway");
    expect(result).not.toHaveProperty("runwayChange");
  });
});
