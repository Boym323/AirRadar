import { describe, expect, it } from "vitest";
import { evaluatePredictiveIntelligence } from "@/lib/predictive-intelligence/engine";
import { replayPredictiveIntelligence } from "@/lib/predictive-intelligence/replay";
import type { PredictionSample } from "@/lib/predictive-intelligence/types";

const airport = { icao: "LKPR", lat: 50.1008, lon: 14.2632 };
const sample = (at: number, lat: number, lon: number, trackDeg = 90): PredictionSample => ({ observedAt: at, lat, lon, altitudeFt: 20_000, groundSpeedKt: 300, verticalRateFpm: -500, trackDeg });

describe("Predictive Intelligence V1", () => {
  it("returns an explainable ETA from bounded recent progress", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const samples = [sample(now - 180_000, 50.10, 13.50), sample(now - 60_000, 50.10, 13.80)];
    const result = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: "ABC123", timestamp: now, phase: "CRUISE", sample: samples[1]!, destination: "LKPR", destinationStatus: "KNOWN" }, recentSamples: samples, destinationAirport: airport, now });
    expect(result.prediction.modelVersion).toBe("predictive-intelligence-v1");
    expect(result.prediction.eta.estimatedArrivalAt).toBeGreaterThan(now);
    expect(result.prediction.eta.evidence.map((item) => item.key)).toContain("distanceRemainingNm");
  });

  it("never uses future samples during replay", () => {
    const at = Date.parse("2026-01-01T12:00:00Z");
    const base = [sample(at, 50.10, 13.50), sample(at + 60_000, 50.10, 13.80), sample(at + 120_000, 50.10, 14.10)];
    const changedFuture = [...base.slice(0, 1), sample(at + 60_000, 49, 12, 270), sample(at + 120_000, 48, 11, 270)];
    const first = replayPredictiveIntelligence({ samples: base, destinationAirport: airport, destination: "LKPR", destinationStatus: "KNOWN" }).predictions[0];
    const second = replayPredictiveIntelligence({ samples: changedFuture, destinationAirport: airport, destination: "LKPR", destinationStatus: "KNOWN" }).predictions[0];
    expect(second).toEqual(first);
  });

  it("degrades safely for unknown destinations and stale samples", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const stale = [sample(now - 600_000, 50, 13), sample(now - 540_000, 50, 13.1)];
    const result = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: "ABC123", timestamp: now, phase: "CRUISE", sample: stale[1]!, destination: null, destinationStatus: "UNKNOWN" }, recentSamples: stale, destinationAirport: null, now });
    expect(result.prediction.eta.confidence).toBe("UNKNOWN");
    expect(result.prediction.runway.runway).toBeNull();
  });
});
