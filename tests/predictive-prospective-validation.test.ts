import { afterEach, describe, expect, it, vi } from "vitest";
import { scoreEta, scoreRunway, summarizeEta } from "@/lib/predictive-intelligence/validation";
import { evaluatePredictiveIntelligence } from "@/lib/predictive-intelligence/engine";
import { prospectiveObservationFor, ProspectiveValidationWriter, type ObservationTable, type ProspectiveObservation } from "@/lib/predictive-intelligence/prospective";
import type { Aircraft } from "@/lib/aircraft/types";
import type { PredictiveFlightState } from "@/lib/predictive-intelligence/types";
import "temporal-polyfill/full/global";

afterEach(() => vi.useRealTimers());

function observation(overrides: Partial<ProspectiveObservation> = {}): ProspectiveObservation {
  return {
    observationKey: "writer:test:ETA:one", lifecycleKey: "writer:test", capability: "ETA", aircraftIcao: "ABC123", flightId: null,
    callsign: "TEST1", destinationIcao: "LKPR", predictedAt: Date.parse("2026-10-03T06:00:00.123Z"), horizonSeconds: 300, horizonBucket: "<=5m", flightPhase: "APPROACH", latitude: 50, longitude: 14, altitudeFt: 2_000, groundSpeedKt: 120, verticalRateFpm: -300, trackDeg: 240, predictedLandingAt: Date.parse("2026-10-03T06:05:00.123Z"), distanceRemainingNm: 5, predictedRunway: null, alternativeRunway: null, previousRunway: null, predictionConfidence: "HIGH", etaConfidence: "HIGH", evidenceJson: "[]", modelVersion: "test", softwareVersion: "test", graduationMode: "SHADOW", ...overrides,
  };
}

function fakeTable(rows = new Map<string, Record<string, unknown>>()): ObservationTable {
  return { create: async (input) => { const key = String(input.observationKey); if (rows.has(key)) { const error = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" }); throw error; } rows.set(key, input); return input; } };
}

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

  it("writes Temporal.Instant values without losing milliseconds", async () => {
    vi.useFakeTimers();
    const stored = new Map<string, Record<string, unknown>>();
    const writer = new ProspectiveValidationWriter(fakeTable(stored));
    writer.enqueue([observation()]);
    await writer.flush();
    const row = stored.get("writer:test:ETA:one")!;
    expect(row.predictedAt).toBeInstanceOf(Temporal.Instant);
    expect((row.predictedAt as Temporal.Instant).epochMilliseconds).toBe(Date.parse("2026-10-03T06:00:00.123Z"));
    expect((row.predictedLandingAt as Temporal.Instant).epochMilliseconds).toBe(Date.parse("2026-10-03T06:05:00.123Z"));
    expect(writer.diagnostics()).toMatchObject({ persisted: 1, persistenceFailures: 0, lastSuccessfulWrite: expect.any(String) });
  });

  it("persists ETA produced by the real engine with canonical integer timestamps", async () => {
    const now = Date.parse("2026-10-03T06:00:00.123Z");
    const airport = { icao: "LKPR", lat: 50.1008, lon: 14.2632 };
    const samples = [
      { observedAt: now - 180_000, lat: 50.10, lon: 13.50, altitudeFt: 20_000, groundSpeedKt: 300, verticalRateFpm: -500, trackDeg: 90 },
      { observedAt: now - 60_000, lat: 50.10, lon: 13.80, altitudeFt: 18_000, groundSpeedKt: 300, verticalRateFpm: -500, trackDeg: 90 },
    ];
    const prediction = evaluatePredictiveIntelligence({
      flightState: { aircraftIcao: "ABC123", timestamp: now, phase: "CRUISE", sample: samples[1]!, destination: "LKPR", destinationStatus: "KNOWN" },
      recentSamples: samples, destinationAirport: airport, now,
    }).prediction;
    expect(Number.isSafeInteger(prediction.evaluatedAt)).toBe(true);
    expect(prediction.eta.estimatedArrivalAt).not.toBeNull();
    expect(Number.isSafeInteger(prediction.eta.estimatedArrivalAt)).toBe(true);
    expect(prediction.eta.estimatedArrivalAt).toBeGreaterThanOrEqual(now);

    const aircraft = { icaoHex: "ABC123", callsign: "TEST1", lat: 50.10, lon: 13.80, altitude: 18_000, groundSpeed: 300, verticalRate: -500, track: 90, onGround: false, enrichment: { route: { destination: "LKPR" } } } as unknown as Aircraft;
    const observations = prospectiveObservationFor(aircraft, prediction, "ABC123:flight-real-eta", null);
    const rows = new Map<string, Record<string, unknown>>();
    const writer = new ProspectiveValidationWriter(fakeTable(rows));
    writer.enqueue(observations.filter((item) => item.capability === "ETA"));
    await writer.flush();
    expect(rows.get(observations[0]!.observationKey)?.capability).toBe("ETA");
    expect(writer.diagnostics()).toMatchObject({ persisted: 1, persistenceFailures: 0 });
  });

  it("records invalid timestamps as failures without false success", async () => {
    vi.useFakeTimers();
    const writer = new ProspectiveValidationWriter(fakeTable());
    writer.enqueue([observation({ predictedAt: Number.NaN })]);
    await writer.flush();
    expect(writer.diagnostics()).toMatchObject({ persisted: 0, persistenceFailures: 1, lastSuccessfulWrite: null, lastFailureClassification: "invalid_timestamp", lastFailureField: "predictedAt" });
  });

  it.each([
    ["predictedAt", { predictedAt: Date.parse("2026-10-03T06:00:00Z") + 0.5 }],
    ["predictedLandingAt", { predictedLandingAt: Date.parse("2026-10-03T06:05:00Z") + 0.5 }],
    ["predictedAt", { predictedAt: Number.POSITIVE_INFINITY }],
    ["predictedLandingAt", { predictedLandingAt: Number.NaN }],
    ["predictedAt", { predictedAt: Number.MAX_SAFE_INTEGER + 1 }],
    ["predictedLandingAt", { predictedLandingAt: 8_640_000_000_000_001 }],
  ] as const)("rejects invalid %s without false success", async (field, overrides) => {
    const writer = new ProspectiveValidationWriter(fakeTable());
    writer.enqueue([observation(overrides)]);
    await writer.flush();
    expect(writer.diagnostics()).toMatchObject({ persisted: 0, persistenceFailures: 1, lastFailureClassification: "invalid_timestamp", lastFailureField: field });
  });

  it("records primary persistence errors and isolates them from the caller", async () => {
    vi.useFakeTimers();
    const table: ObservationTable = { create: async () => { throw new Error("database unavailable"); } };
    const writer = new ProspectiveValidationWriter(table);
    writer.enqueue([observation()]);
    await expect(writer.flush()).resolves.toBeUndefined();
    expect(writer.diagnostics()).toMatchObject({ persisted: 0, persistenceFailures: 1, lastSuccessfulWrite: null, lastFailureClassification: "database" });
  });

  it("persists one row for duplicate keys and classifies the duplicate as dedupe", async () => {
    vi.useFakeTimers();
    const rows = new Map<string, Record<string, unknown>>();
    const first = new ProspectiveValidationWriter(fakeTable(rows));
    first.enqueue([observation(), observation()]);
    await first.flush();
    const restarted = new ProspectiveValidationWriter(fakeTable(rows));
    restarted.enqueue([observation()]);
    await restarted.flush();
    expect(rows.size).toBe(1);
    expect(first.diagnostics()).toMatchObject({ persisted: 1, skippedDedupe: 1, persistenceFailures: 0 });
    expect(restarted.diagnostics()).toMatchObject({ persisted: 0, skippedDedupe: 1, persistenceFailures: 0 });
  });
});
