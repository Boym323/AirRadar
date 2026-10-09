import { describe, expect, it } from "vitest";
import { buildTruthAccuracyReport } from "@/lib/predictive-intelligence/truth-accuracy-e";
import type { TruthAccuracySample } from "@/lib/predictive-intelligence/truth-accuracy-e";

const start = Date.parse("2026-10-01T12:00:00.000Z");
function row(key: number, overrides: Partial<TruthAccuracySample> = {}): TruthAccuracySample {
  return {
    observationKey: `key-${key}`, lifecycleKey: `flight-${key}`, capability: "ETA",
    predictedAtMs: start + key * 1000, destinationIcao: "LKPR",
    predictionConfidence: "HIGH", flightPhase: "APPROACH",
    scored: true, etaAbsoluteErrorSeconds: 120,
    ...overrides,
  };
}

describe("E1-E4 and E6 truth-first quality audit", () => {
  it("deduplicates each lifecycle/capability to earliest prospective prediction", () => {
    const first = row(1, { etaAbsoluteErrorSeconds: 600 });
    const later = row(2, { lifecycleKey: first.lifecycleKey, etaAbsoluteErrorSeconds: 1 });
    const report = buildTruthAccuracyReport([later, first], {sourceAvailable: true, complete: true});
    expect(report.truth.ETA).toMatchObject({flights: 1, confirmed: 1, etaMaeSeconds: 600});
    expect(report.truth.RUNWAY).toMatchObject({flights: 0, confirmed: 0, coverage: null});
  });
  it("separates insufficient truth from negative prediction outcomes", () => {
    const report = buildTruthAccuracyReport([
      row(1, {scored: false, etaAbsoluteErrorSeconds: null}),
      row(2, {scored: true, etaAbsoluteErrorSeconds: null}),
      row(3, {scored: true, etaAbsoluteErrorSeconds: 0}),
    ], {sourceAvailable: true, complete: true});
    expect(report.truth.ETA).toMatchObject({flights: 3, confirmed: 1, unscorable: 2, coverage: 1/3});
    expect(report.decision).toBe("INSUFFICIENT_TRUTH");
    expect(report.airports[0]?.state).toBe("INSUFFICIENT_TRUTH");
    expect(report.airports[0]?.cohort.etaMaeSeconds).toBeNull();
  });
  it("requires complete samples and threshold to show airport or confidence accuracy", () => {
    const rows = Array.from({length: 25}, (_, index) => row(index, {etaAbsoluteErrorSeconds: index * 10}));
    const ready = buildTruthAccuracyReport(rows, {sourceAvailable: true, complete: true});
    expect(ready.airports[0]).toMatchObject({airport: "LKPR", state: "MEASURED"});
    expect(ready.confidence.find(x => x.capability === "ETA" && x.confidence === "HIGH")).toMatchObject({
      state: "MEASURED", confirmed: 25, successRate: 1,
    });
    const capped = buildTruthAccuracyReport(rows, {sourceAvailable: true, complete: false});
    expect(capped.decision).toBe("COLLECTION_INCOMPLETE");
    expect(capped.airports[0]?.cohort.etaMaeSeconds).toBeNull();
    expect(capped.confidence[2]?.successRate).toBeNull();
  });
  it("keeps runway outcomes separate from ETA and scores wrong runway as wrong", () => {
    const rows = Array.from({length: 25}, (_, index) => row(index, {
      capability: "RUNWAY", runwayExactEnd: index < 20,
      etaAbsoluteErrorSeconds: undefined,
    }));
    const report = buildTruthAccuracyReport(rows, {sourceAvailable: true, complete: true});
    expect(report.truth.RUNWAY.exactRunwayAccuracy).toBe(.8);
    expect(report.decision).toBe("INSUFFICIENT_TRUTH"); // ETA has no independent truth.
    expect(report.confidence.find(x => x.capability === "RUNWAY" && x.confidence === "HIGH")?.successRate).toBe(.8);
  });
  it("bounds airport rows and prevents malformed ICAO from surfacing", () => {
    const airports = Array.from({length: 40}, (_, i) => row(i, {destinationIcao: `AB${String(i).padStart(2, "0")}`}));
    const report = buildTruthAccuracyReport([...airports, row(41, {destinationIcao: "SECRET-PLACE"})],
      {sourceAvailable: true, complete: true});
    expect(report.airports).toHaveLength(12);
    expect(report.airportOverflow).toBe(28);
    expect(report.airports.every(x => /^[A-Z0-9]{4}$/.test(x.airport))).toBe(true);
  });
  it("never labels unavailable source as measured even with complete cached samples", () => {
    const rows = Array.from({length: 25}, (_, index) => row(index, {etaAbsoluteErrorSeconds: 90}));
    const unavailable = buildTruthAccuracyReport(rows, {sourceAvailable: false, complete: true});
    expect(unavailable.decision).toBe("SOURCE_UNAVAILABLE");
    expect(unavailable.truth.ETA.etaMaeSeconds).toBeNull();
    expect(unavailable.airports[0]?.state).toBe("SOURCE_UNAVAILABLE");
    expect(unavailable.phases[0]?.state).toBe("SOURCE_UNAVAILABLE");
    expect(unavailable.confidence.find(x => x.capability === "ETA" && x.confidence === "HIGH"))
      .toMatchObject({state: "SOURCE_UNAVAILABLE", successRate: null});
    const incomplete = buildTruthAccuracyReport(rows, {sourceAvailable: true, complete: false});
    expect(incomplete.truth.ETA.etaMaeSeconds).toBeNull();
    expect(incomplete.phases[0]?.state).toBe("COLLECTION_INCOMPLETE");
  });

  it("treats unavailable source as unavailable, never high-confidence accuracy", () => {
    const report = buildTruthAccuracyReport([row(1)], {sourceAvailable: false, complete: false});
    expect(report.decision).toBe("SOURCE_UNAVAILABLE");
    expect(report.limitations).toContain("NO_AUTOMATIC_GRADUATION");
  });
});
