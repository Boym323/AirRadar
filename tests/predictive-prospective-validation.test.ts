import { describe, expect, it } from "vitest";
import { scoreEta, scoreRunway, summarizeEta } from "@/lib/predictive-intelligence/validation";
import { prospectiveObservationFor } from "@/lib/predictive-intelligence/prospective";
import type { Aircraft } from "@/lib/aircraft/types";
import type { PredictiveFlightState } from "@/lib/predictive-intelligence/types";

describe("prospective validation scoring", () => {
  it("uses signed prediction minus actual ETA and excludes uncertain truth", () => {
    expect(scoreEta(Date.parse("2026-01-01T12:10:00Z"), Date.parse("2026-01-01T12:12:00Z"), "CONFIRMED")).toMatchObject({ signedErrorSeconds: -120, absoluteErrorSeconds: 120, status: "SCORED" });
    expect(scoreEta(1, 2, "AMBIGUOUS").status).toBe("UNSCORABLE");
  });
  it("keeps runway end and physical-runway metrics separate", () => {
    expect(scoreRunway("24", "06", "CONFIRMED")).toMatchObject({ exactEnd: false, physicalRunway: true });
    expect(scoreRunway(null, "24", "CONFIRMED")).toMatchObject({ exactEnd: false, physicalRunway: false });
    expect(scoreRunway("24", null, "UNKNOWN").status).toBe("UNSCORABLE");
  });
  it("aggregates confidence-independent ETA samples deterministically", () => {
    const summary = summarizeEta([scoreEta(2000, 1000, "CONFIRMED"), scoreEta(1, 2, "UNKNOWN")]);
    expect(summary).toMatchObject({ sampleCount: 2, scoredFlights: 1, unscorableFlights: 1, maeSeconds: 1 });
  });
  it("captures an immutable prospective snapshot per lifecycle", () => {
    const aircraft = { icaoHex: "ABC123", callsign: "TEST1", lat: 50, lon: 14, altitude: 12_000, groundSpeed: 240, verticalRate: -500, track: 240, onGround: false, enrichment: { route: { destination: "LKPR" } } } as unknown as Aircraft;
    const prediction = { modelVersion: "predictive-intelligence-v1", evaluatedAt: 1_000, eta: { estimatedArrivalAt: 301_000, confidence: "HIGH", evidence: [] }, runway: { runway: "24", alternative: "06", confidence: "HIGH", changed: false, evidence: [] }, trajectory: { state: "NORMAL", confidence: "MEDIUM", evidence: [] } } as unknown as PredictiveFlightState;
    const observations = prospectiveObservationFor(aircraft, prediction, "ABC123:flight-a", null);
    aircraft.lat = 51;
    expect(observations[0]).toMatchObject({ lifecycleKey: "ABC123:flight-a", latitude: 50, predictedLandingAt: 301_000 });
    expect(prospectiveObservationFor(aircraft, prediction, "ABC123:flight-b", null)[0]?.observationKey).not.toBe(observations[0]?.observationKey);
  });
});
