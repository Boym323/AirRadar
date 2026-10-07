import { describe, expect, it } from "vitest";
import { PredictiveStateStore } from "@/lib/predictive-intelligence/state";
import type { PredictionSample, PredictiveInput } from "@/lib/predictive-intelligence/types";

function input(lifecycleKey: string, now: number): PredictiveInput {
  const sample: PredictionSample = {
    observedAt: now,
    lat: 50,
    lon: 14,
    altitudeFt: 10_000,
    groundSpeedKt: 250,
    verticalRateFpm: 0,
    trackDeg: 90,
  };
  return {
    flightState: {
      aircraftIcao: "ABC123",
      lifecycleKey,
      timestamp: now,
      phase: "CRUISE",
      sample,
      destination: null,
      destinationStatus: "UNKNOWN",
    },
    recentSamples: [sample],
    destinationAirport: null,
    now,
  };
}

describe("PredictiveStateStore lookup", () => {
  it("returns the newest lifecycle state for one ICAO without changing semantics", () => {
    const store = new PredictiveStateStore();
    const first = store.evaluate(input("ABC123:first", 1_000));
    const second = store.evaluate(input("ABC123:second", 2_000));

    expect(first?.evaluatedAt).toBe(1_000);
    expect(second?.evaluatedAt).toBe(2_000);
    expect(store.get("abc123")?.evaluatedAt).toBe(2_000);

    store.forget("ABC123");
    expect(store.get("ABC123")).toBeNull();
  });
});
