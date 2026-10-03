import { afterEach, describe, expect, it, vi } from "vitest";
import { scoreEta, scoreRunway, summarizeEta } from "@/lib/predictive-intelligence/validation";
import { evaluatePredictiveIntelligence } from "@/lib/predictive-intelligence/engine";
import { compareProspectiveProcessSessions, databaseFailureSignature, isNonRetryableIntegrityFailure, prospectiveObservationFor, PROSPECTIVE_REQUIRED_DB_FIELD_MATRIX, PROSPECTIVE_REQUIRED_DB_FIELDS, ProspectiveValidationWriter, validateProspectiveObservation, type ObservationTable, type ProspectiveObservation } from "@/lib/predictive-intelligence/prospective";
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
  return { create: async (input) => { const key = String(input.observationKey); if (rows.has(key)) { const error = Object.assign(new Error("duplicate key value violates unique constraint"), { sqlState: "23505", constraint: "predictiveObservation_pkey", cause: Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505", constraint: "predictiveObservation_pkey" }) }); throw error; } rows.set(key, input); return input; } };
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
    expect(writer.diagnostics()).toMatchObject({ rowsCommittedByWriter: 1, committedBatches: 1, firstCommitAt: expect.any(String), lastCommitAt: expect.any(String), persistenceFailures: 0 });
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
    expect(writer.diagnostics()).toMatchObject({ rowsCommittedByWriter: 1, persistenceFailures: 0 });
  });

  it("rejects invalid timestamps before enqueue with an explicit reason", async () => {
    vi.useFakeTimers();
    const writer = new ProspectiveValidationWriter(fakeTable());
    writer.enqueue([observation({ predictedAt: Number.NaN })]);
    await writer.flush();
    expect(writer.diagnostics()).toMatchObject({ rowsCommittedByWriter: 0, invalid: 1, persistenceFailures: 0, invalidSkipReasons: { invalid_predicted_at: 1 } });
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
    const reason = field === "predictedAt" ? "invalid_predicted_at" : "invalid_predicted_landing_at";
    expect(writer.diagnostics()).toMatchObject({ rowsCommittedByWriter: 0, invalid: 1, persistenceFailures: 0, invalidSkipReasons: { [reason]: 1 } });
  });

  it("records primary persistence errors and isolates them from the caller", async () => {
    vi.useFakeTimers();
    const table: ObservationTable = { create: async () => { throw new Error("database unavailable"); } };
    const writer = new ProspectiveValidationWriter(table);
    writer.enqueue([observation()]);
    await expect(writer.flush()).resolves.toBeUndefined();
    expect(writer.diagnostics()).toMatchObject({ rowsCommittedByWriter: 0, persistenceFailures: 1, lastFailureClassification: "database" });
  });

  it("reproduces the schema mismatch for RUNWAY and TRAJECTORY optional horizon data", async () => {
    const strictPreFixTable: ObservationTable = { create: async (input) => {
      if (input.horizonSeconds === null) {
        throw Object.assign(new Error('null value in column "horizonSeconds" of relation "predictiveObservation" violates not-null constraint'), {
          sqlState: "23502", table_name: "predictiveObservation", column_name: "horizonSeconds",
          detail: 'Failing row contains (RUNWAY, null horizon).', constraint_name: "predictiveObservation_horizonSeconds_not_null",
        });
      }
      return input;
    } };
    for (const item of [
      observation({ capability: "RUNWAY", horizonBucket: "first", horizonSeconds: null, predictedLandingAt: null, predictedRunway: "24" }),
      observation({ capability: "TRAJECTORY", horizonBucket: "metadata", horizonSeconds: null, predictedLandingAt: null, predictedRunway: null }),
    ]) {
      const writer = new ProspectiveValidationWriter(strictPreFixTable);
      writer.enqueue([item]);
      await writer.flush();
      expect(writer.diagnostics()).toMatchObject({ persistenceFailures: 1, lastDatabaseFailure: {
        sqlState: "23502", table: "predictiveObservation", column: "horizonSeconds", messageClass: "not_null_violation",
        capability: item.capability, horizonBucket: item.horizonBucket, writerOperation: "create",
      } });
      expect(writer.diagnostics().lastDatabaseFailure?.detail).toContain("Failing row");
    }

    const correctedNullableTable: ObservationTable = { create: async (input) => input };
    const writer = new ProspectiveValidationWriter(correctedNullableTable);
    writer.enqueue([
      observation({ capability: "RUNWAY", horizonBucket: "first", horizonSeconds: null, predictedLandingAt: null, predictedRunway: "24" }),
      observation({ capability: "TRAJECTORY", observationKey: "writer:test:TRAJECTORY:metadata", horizonBucket: "metadata", horizonSeconds: null, predictedLandingAt: null, predictedRunway: null }),
    ]);
    await writer.flush();
    expect(writer.diagnostics()).toMatchObject({ rowsCommittedByWriter: 2, persistenceFailures: 0 });
  });

  it("skips invalid lifecycle identity before enqueue with an explicit reason", async () => {
    const create = vi.fn(async (input: Record<string, unknown>) => input);
    const writer = new ProspectiveValidationWriter({ create });
    const invalid = observation({ lifecycleKey: "", observationKey: "writer:test:invalid" });
    expect(validateProspectiveObservation(invalid)).toBe("missing_lifecycle_key");
    writer.enqueue([invalid, observation({ observationKey: "writer:test:ETA:valid" })]);
    await writer.flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(writer.diagnostics()).toMatchObject({ invalid: 1, invalidSkipReasons: { missing_lifecycle_key: 1 }, rowsCommittedByWriter: 1 });
  });

  it("isolates invalid mixed-capability rows before persistence", async () => {
    const create = vi.fn(async (input: Record<string, unknown>) => input);
    const writer = new ProspectiveValidationWriter({ create });
    writer.enqueue([
      observation({ observationKey: "mixed:flight:ETA:valid", capability: "ETA" }),
      observation({ observationKey: "mixed:flight:RUNWAY:invalid", capability: "RUNWAY", lifecycleKey: "" }),
      observation({ observationKey: "mixed:flight:RUNWAY:valid", capability: "RUNWAY", horizonSeconds: null, predictedLandingAt: null, predictedRunway: "24" }),
      observation({ observationKey: "mixed:flight:TRAJECTORY:invalid", capability: "TRAJECTORY", predictedAt: Number.NaN, predictedLandingAt: null }),
      observation({ observationKey: "mixed:flight:TRAJECTORY:valid", capability: "TRAJECTORY", horizonSeconds: null, predictedLandingAt: null }),
    ]);
    await writer.flush();

    expect(create).toHaveBeenCalledTimes(3);
    expect(writer.diagnostics()).toMatchObject({
      rowsCommittedByWriter: 3,
      invalid: 2,
      persistenceFailures: 0,
      integrityRejects: 0,
      invalidSkipReasons: { missing_lifecycle_key: 1, invalid_predicted_at: 1 },
      invalidSkipReasonsByCapability: {
        ETA: {},
        RUNWAY: { missing_lifecycle_key: 1 },
        RUNWAY_CHANGE: {},
        TRAJECTORY: { invalid_predicted_at: 1 },
      },
    });
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
    expect(first.diagnostics()).toMatchObject({ rowsCommittedByWriter: 1, dedupePending: 1, persistenceFailures: 0 });
    expect(restarted.diagnostics()).toMatchObject({ rowsCommittedByWriter: 0, dedupeDatabase: 1, persistenceFailures: 0 });
    expect(restarted.diagnostics()).toMatchObject({ persistenceFailures: 0, lastDatabaseFailure: null, databaseFailureHistogram: [], failuresByCapability: { ETA: 0, RUNWAY: 0, RUNWAY_CHANGE: 0, TRAJECTORY: 0 } });
  });

  it("reconciles captured observations across invalid, pending/database dedupe, commit, failure, and drain", async () => {
    const duplicateKey = "writer:test:ETA:database-duplicate";
    const failureKey = "writer:test:ETA:failure";
    const create = vi.fn(async (input: Record<string, unknown>) => {
      if (input.observationKey === duplicateKey) throw Object.assign(new Error("duplicate"), { sqlState: "23505", constraint: "predictiveObservation_pkey" });
      if (input.observationKey === failureKey) throw new Error("database unavailable");
      return input;
    });
    const writer = new ProspectiveValidationWriter({ create });
    writer.enqueue([
      observation({ observationKey: "writer:test:ETA:committed" }),
      observation({ observationKey: "writer:test:ETA:committed" }),
      observation({ observationKey: duplicateKey }),
      observation({ observationKey: failureKey }),
      observation({ predictedAt: Number.NaN }),
    ]);
    await writer.drain();
    const diagnostics = writer.diagnostics();
    expect(diagnostics).toMatchObject({ captured: 5, invalid: 1, enqueued: 3, dedupePending: 1, dedupeDatabase: 1, persistenceAttempted: 3, rowsCommittedByWriter: 1, persistenceFailures: 1, dropped: 0, queueDepth: 0, pendingKeyCount: 0, accounting: { captureBalance: 0, enqueueBalance: 0, drained: true } });
  });

  it("reconciles queued rows discarded after an integrity failure across multiple batches", async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error("not null violation"), { sqlState: "23502", constraint: "predictiveObservation_required" });
    });
    const writer = new ProspectiveValidationWriter({ create });
    writer.enqueue(Array.from({ length: 30 }, (_, index) => observation({
      observationKey: `writer:test:ETA:integrity-${index}`,
    })));

    await writer.drain();

    expect(create).toHaveBeenCalledTimes(1);
    expect(writer.diagnostics()).toMatchObject({
      captured: 30,
      enqueued: 30,
      persistenceAttempted: 1,
      rowsCommittedByWriter: 0,
      persistenceFailures: 1,
      integrityRejects: 1,
      persistenceSuspended: true,
      dropped: 29,
      droppedAfterEnqueue: 29,
      queueDepth: 0,
      pendingKeyCount: 0,
      accounting: { captureBalance: 0, enqueueBalance: 0, drained: true },
    });
  });

  it("uses bounded per-capability invalid reasons and rejects every required DB null-like value", async () => {
    const cases: Array<[string, Partial<ProspectiveObservation>]> = [
      ["missing_observation_key", { observationKey: "" }],
      ["missing_lifecycle_key", { lifecycleKey: "" }],
      ["invalid_capability", { capability: "" as ProspectiveObservation["capability"] }],
      ["missing_aircraft_icao", { aircraftIcao: "" }],
      ["missing_horizon_bucket", { horizonBucket: "" }],
      ["missing_flight_phase", { flightPhase: "" }],
      ["missing_prediction_confidence", { predictionConfidence: "" }],
      ["missing_evidence", { evidenceJson: "" }],
      ["missing_model_version", { modelVersion: "" }],
      ["missing_software_version", { softwareVersion: "" }],
      ["missing_graduation_mode", { graduationMode: "" }],
      ["invalid_predicted_at", { predictedAt: undefined }],
      ["invalid_coordinates", { latitude: Number.NaN }],
    ];
    const writer = new ProspectiveValidationWriter({ create: async (input) => input });
    writer.enqueue(cases.map(([, overrides], index) => observation({ ...overrides, capability: overrides.capability ?? (index % 2 ? "TRAJECTORY" : "RUNWAY"), observationKey: Object.prototype.hasOwnProperty.call(overrides, "observationKey") ? overrides.observationKey : `invalid:test:${index}:key` })));
    await writer.drain();
    const diagnostics = writer.diagnostics();
    expect(diagnostics.invalid).toBe(cases.length);
    expect(diagnostics.invalidSkipReasonsByCapability.RUNWAY).toBeTruthy();
    expect(diagnostics.invalidSkipReasonsByCapability.TRAJECTORY).toBeTruthy();
    expect(diagnostics.accounting).toMatchObject({ captureBalance: 0, enqueueBalance: 0, drained: true });
  });

  it("starts each writer instance with a fresh session and zero counters", () => {
    const first = new ProspectiveValidationWriter(null).diagnostics();
    const second = new ProspectiveValidationWriter(null).diagnostics();
    expect(second.writerSessionId).not.toBe(first.writerSessionId);
    expect(second.counterStartedAt).toEqual(expect.any(String));
    expect(second.captured).toBe(0);
    expect(second.rowsCommittedByWriter).toBe(0);
    expect(second.pid).toBe(process.pid);
    expect(second.processStartedAt).toEqual(first.processStartedAt);
  });

  it("exposes the required DB field matrix and detects process/session restarts", () => {
    expect(PROSPECTIVE_REQUIRED_DB_FIELD_MATRIX.map((entry) => entry.column)).toEqual([...PROSPECTIVE_REQUIRED_DB_FIELDS]);
    expect(PROSPECTIVE_REQUIRED_DB_FIELD_MATRIX.every((entry) => entry.source.startsWith("ProspectiveObservation.") && entry.runtimeGuard === "validateProspectiveObservation" && entry.capability === "all")).toBe(true);
    const before = { writerSessionId: "before", processStartedAt: "2026-10-03T06:00:00.000Z", pid: 10 };
    expect(compareProspectiveProcessSessions(before, before)).toMatchObject({ mainPidBefore: 10, mainPidAfter: 10, restartCount: 0, comparable: true });
    expect(compareProspectiveProcessSessions(before, { ...before, pid: 11, writerSessionId: "after" })).toMatchObject({ mainPidBefore: 10, mainPidAfter: 11, writerSessionIdAfter: "after", restartCount: 1, comparable: false });
  });

  it("keeps only structural database fingerprints and rejects other unique constraints", async () => {
    const errors = [
      Object.assign(new Error("numeric value out of range"), { sqlState: "22003" }),
      Object.assign(new Error("null value in column violates not-null constraint"), { sqlState: "23502", constraint: "other_pkey" }),
      Object.assign(new Error("connection failure"), { code: "08006" }),
      Object.assign(new Error("duplicate key value violates unique constraint other_unique"), { sqlState: "23505", constraint: "other_unique" }),
    ];
    for (const error of errors) {
      const writer = new ProspectiveValidationWriter({ create: async () => { throw error; } });
      writer.enqueue([observation()]);
      await writer.flush();
      const diagnostics = writer.diagnostics();
      expect(diagnostics.persistenceFailures).toBe(1);
      const shape = error as Error & { code?: string; sqlState?: string };
      expect(diagnostics.lastDatabaseFailure?.sqlState ?? diagnostics.lastDatabaseFailure?.code).toBe(shape.sqlState ?? shape.code);
      expect(diagnostics.databaseFailureHistogram).toHaveLength(1);
      expect(JSON.stringify(diagnostics)).not.toContain(error.message);
    }
  });

  it("captures PostgreSQL table, column, detail, and safe observation context without payload data", () => {
    const error = Object.assign(new Error('null value in column "horizonSeconds" of relation "predictiveObservation" violates not-null constraint'), {
      sqlState: "23502", table_name: "predictiveObservation", column_name: "horizonSeconds",
      detail: "Failing row contains sensitive aircraft evidence", constraint_name: "predictiveObservation_horizonSeconds_not_null",
    });
    const signature = databaseFailureSignature(error, { capability: "TRAJECTORY", horizonBucket: "metadata", observationKeyHash: "0123456789abcdef", writerOperation: "create" });
    expect(signature).toMatchObject({ sqlState: "23502", table: "predictiveObservation", column: "horizonSeconds", detail: "Failing row contains <redacted>", capability: "TRAJECTORY", horizonBucket: "metadata", observationKeyHash: "0123456789abcdef", writerOperation: "create" });
    expect(JSON.stringify(signature)).not.toContain("aircraft evidence");

    const wrapped = Object.assign(new Error("persistence failed"), {
      code: "P2025",
      cause: Object.assign(new Error("driver rejected write"), {
        code: "23502", schema: "public", table_name: "predictiveObservation", column_name: "someColumn",
        detail: "Failing row contains (sensitive value)",
      }),
    });
    expect(databaseFailureSignature(wrapped)).toMatchObject({ sqlState: "23502", table: "predictiveObservation", column: "someColumn", detail: "Failing row contains <redacted>" });
  });

  it("suspends prospective persistence after the first integrity violation", async () => {
    const create = vi.fn(async (input: Record<string, unknown>) => {
      if (create.mock.calls.length === 1) {
        throw Object.assign(new Error("null value in column violates not-null constraint"), {
          code: "23502", schema: "public", table: "predictiveObservation", column: "someColumn",
          detail: "Failing row contains (sensitive value)",
        });
      }
      return input;
    });
    const writer = new ProspectiveValidationWriter({ create });
    writer.enqueue([observation(), observation({ observationKey: "writer:test:ETA:two" })]);
    await writer.flush();
    writer.enqueue([observation({ observationKey: "writer:test:ETA:three" })]);
    await writer.flush();

    expect(isNonRetryableIntegrityFailure(Object.assign(new Error("not null"), { code: "23502" }))).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(writer.diagnostics()).toMatchObject({
      rowsCommittedByWriter: 0,
      persistenceFailures: 1,
      integrityRejects: 1,
      persistenceSuspended: true,
      suspensionReason: "integrity_violation_23502",
      queueDepth: 0,
      dropped: 2,
      lastDatabaseFailure: { sqlState: "23502", table: "predictiveObservation", column: "someColumn" },
    });
  });

  it("bounds cause traversal and classifies unknown wrappers without raw details", () => {
    const error = Object.assign(new Error("secret payload must not escape"), { code: "WRAPPED", cause: { cause: { cause: { cause: { code: "TOO_DEEP" } } } } });
    const signature = databaseFailureSignature(error);
    expect(signature).toMatchObject({ constructorName: "Error", code: "WRAPPED", messageClass: "unknown" });
    expect(JSON.stringify(signature)).not.toContain("secret");
    expect(JSON.stringify(signature)).not.toContain("TOO_DEEP");
  });
});
