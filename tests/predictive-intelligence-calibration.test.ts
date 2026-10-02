import { describe, expect, it } from "vitest";
import { replayPredictiveIntelligence } from "@/lib/predictive-intelligence/replay";
import {
  assertDisjoint,
  assertFutureMutationInvariant,
  latestPredictionAtOrBefore,
  partitionForFlight,
  simpleEtaBaseline,
  splitCorpus,
  summarizeEtaErrors,
} from "@/lib/predictive-intelligence/calibration";
import type { PredictionSample } from "@/lib/predictive-intelligence/types";

const airport = { icao: "LKPR", lat: 50.1008, lon: 14.2632 };
const sample = (observedAt: number, lon: number, groundSpeedKt = 300): PredictionSample => ({ observedAt, lat: 50.1, lon, altitudeFt: 20_000, groundSpeedKt, verticalRateFpm: -500, trackDeg: 90 });

describe("Predictive Intelligence V1 calibration contract", () => {
  it("uses a deterministic, disjoint 70/30 split", () => {
    const corpus = Array.from({ length: 100 }, (_, flightId) => ({ flightId }));
    const first = splitCorpus(corpus);
    const second = splitCorpus(corpus);
    expect(first).toEqual(second);
    expect(first.calibration.length + first.holdout.length).toBe(100);
    assertDisjoint(first.calibration, first.holdout);
    expect(partitionForFlight(42)).toBe(partitionForFlight(42));
  });

  it("selects only the latest checkpoint prediction at or before the checkpoint", () => {
    const predictions = [
      { evaluatedAt: 100, modelVersion: "predictive-intelligence-v1", eta: {}, runway: {}, trajectory: {} },
      { evaluatedAt: 200, modelVersion: "predictive-intelligence-v1", eta: {}, runway: {}, trajectory: {} },
    ] as never[];
    expect(latestPredictionAtOrBefore(predictions, 199)?.evaluatedAt).toBe(100);
    expect(latestPredictionAtOrBefore(predictions, 99)).toBeNull();
  });

  it("keeps the simple ETA baseline independent and transparent", () => {
    const at = Date.parse("2026-01-01T12:00:00Z");
    const result = simpleEtaBaseline([sample(at, 13.5)], airport, at, () => 60);
    expect(result).toBe(at + 12 * 60 * 1000);
  });

  it("reports ETA errors in minutes with sample counts", () => {
    expect(summarizeEtaErrors([60_000, -120_000, 180_000])).toEqual({ n: 3, median: 2, meanAbsoluteError: 2, p90: 3, signedMeanError: 2 / 3 });
  });

  it("passes the future mutation gate for samples after T", () => {
    const at = Date.parse("2026-01-01T12:00:00Z");
    const base = [sample(at - 120_000, 13.5), sample(at, 13.8), sample(at + 120_000, 14.1)];
    const evaluate = (samples: readonly PredictionSample[]) => replayPredictiveIntelligence({ samples, destinationAirport: airport, destination: "LKPR", destinationStatus: "KNOWN" }).predictions.find((prediction) => prediction.evaluatedAt === at);
    assertFutureMutationInvariant(base, evaluate, [
      { name: "future position", mutate: (value) => [...value.slice(0, 2), sample(at + 120_000, 10, 50)] },
      { name: "future destination metadata", mutate: (value) => value },
    ]);
    expect(evaluate(base)).toEqual(evaluate(base.slice(0, 2)));
  });

  it("supports destination metadata resolved as-of evaluation time", () => {
    const at = Date.parse("2026-01-01T12:00:00Z");
    const predictions = replayPredictiveIntelligence({
      samples: [sample(at - 120_000, 13.5), sample(at, 13.8)],
      destinationAirport: null,
      destination: "LKPR",
      destinationStatus: "KNOWN",
      destinationAt: (timestamp) => timestamp < at ? { destination: null, status: "UNKNOWN", airport: null } : { destination: "LKPR", status: "KNOWN", airport },
    }).predictions;
    expect(predictions[0]?.eta.estimatedArrivalAt).toBeNull();
  });
});
