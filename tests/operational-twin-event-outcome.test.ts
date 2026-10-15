import { describe, expect, it, vi } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { computeAtcContext, getCurrentAtcSectorIds, prepareAtcContextDataset } from "@/lib/atc-context/engine";
import type { SectorPolygon } from "@/lib/atc/types";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import {
  OperationalTwinEventOutcomeValidator,
  evaluateOperationalTwinEventOutcomeDecision,
  type OperationalTwinEventOutcomeSlice,
  type OperationalTwinSituation,
} from "@/lib/operational-twin";
import type { SigmetSnapshot } from "@/lib/weather/types";

vi.mock("@/lib/atc-context/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/atc-context/engine")>();
  return { ...actual, computeAtcContext: vi.fn(actual.computeAtcContext) };
});

const baseNow = Date.parse("2026-10-05T10:00:00.000Z");

function situation(events: OperationalTwinSituation["events"]): OperationalTwinSituation {
  return {
    version: "operational-digital-twin-v1",
    status: "available",
    generatedAt: new Date(baseNow).toISOString(),
    aircraft: {
      icaoHex: "ABC123",
      callsign: "TEST123",
      registration: "OK-TST",
      observedAt: new Date(baseNow).toISOString(),
      stateSource: "CANONICAL",
      trackFusionReadiness: null,
    },
    corridor: {
      horizonMinutes: 30,
      stepMinutes: 2,
      mode: "ROUTE_AWARE",
      routeAdherence: "ON_ROUTE",
      routePrecision: "PRECISE",
      maxUncertaintyNm: 6,
      points: [
        { offsetMinutes: 0, at: new Date(baseNow).toISOString(), lat: 49, lon: 17, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
        { offsetMinutes: 30, at: new Date(baseNow + 30 * 60_000).toISOString(), lat: 49, lon: 19, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 6, mode: "ROUTE_AWARE" },
      ],
      waypoints: [],
    },
    weatherCorridor: {
      version: "weather-corridor-intelligence-v1",
      status: "AVAILABLE",
      horizonMinutes: 30,
      corridorMode: "ROUTE_AWARE",
      routePrecision: "PRECISE",
      events: [],
      wind: { status: "AVAILABLE", model: "ICON-EU", trend: "STABLE", deltaAlongTrackKt: 0, samples: [] },
      sources: [],
    },
    events,
    evidence: { observed: 1, published: 0, planned: 0, predicted: events.length, inferred: 0 },
    limitations: ["BOUNDED_PROJECTION", "SAMPLED_INTERSECTIONS"],
  };
}

function aircraft(at: number, lat: number, lon: number, altitude = 30000): Aircraft {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: null,
    aircraftType: null,
    aircraftDescription: null,
    lat,
    lon,
    altitude,
    baroAltitude: altitude,
    geomAltitude: null,
    groundSpeed: 420,
    track: 90,
    verticalRate: 0,
    baroRate: 0,
    geomRate: null,
    squawk: null,
    category: null,
    emergency: null,
    rssi: -10,
    messages: 100,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: new Date(at).toISOString(),
    source: "ADS-B",
    origin: "local",
    provenance: {
      seenLocal: true,
      seenNetwork: false,
      lastLocalSeen: new Date(at).toISOString(),
      lastNetworkSeen: null,
      positionOrigin: "local",
      positionSource: "ADS-B",
    },
    sourceType: null,
    onGround: false,
    distanceKm: null,
    bearing: null,
    trail: [],
    targetState: null,
    operationalStatus: null,
    adsbTelemetry: null,
  };
}

function testAtcDataset(id = "TARGET", west = 17.4, east = 17.6) {
  return prepareAtcContextDataset({
    sectors: [{
      id,
      name: id,
      atcCallsign: id,
      airspaceType: "CTA_SECTOR",
      airspaceClass: "C",
      polygons: [[[west, 48.9], [east, 48.9], [east, 49.1], [west, 49.1], [west, 48.9]]],
      lowerAltitudeFt: 0,
      upperAltitudeFt: 40000,
      frequencies: [],
      validFrom: null,
      validTo: null,
      country: "CZ",
      source: "test",
      sourceReference: "test",
      lastVerifiedAt: new Date(baseNow).toISOString(),
    }],
    routeDocuments: [],
  });
}

function event(type: OperationalTwinSituation["events"][number]["type"], atMinutes: number, overrides: Partial<OperationalTwinSituation["events"][number]> = {}) {
  const at = new Date(baseNow + atMinutes * 60_000).toISOString();
  return {
    id: `${type.toLowerCase()}:${at}`,
    type,
    offsetMinutes: atMinutes,
    at,
    title: type,
    detail: null,
    provenance: "PREDICTED" as const,
    confidence: "HIGH" as const,
    source: "test",
    sourceReference: null,
    lat: null,
    lon: null,
    altitudeFt: 30000,
    ...overrides,
  };
}

function landing(at: number, airportIcao = "LKPR", runway = "24"): FlightIntelligenceEvent {
  return {
    id: "landing-1",
    eventKey: "landing-1",
    lifecycleKey: "ABC123:TEST123",
    type: "LANDING",
    phase: "LANDED",
    icaoHex: "ABC123",
    flightId: null,
    callsign: "TEST123",
    registration: null,
    occurredAt: new Date(at).toISOString(),
    detectedAt: new Date(at).toISOString(),
    latitude: 50.1,
    longitude: 14.26,
    altitude: 0,
    confidence: 0.95,
    confidenceLevel: "high",
    airportIcao,
    runway,
    sectorId: null,
    evidence: [],
    metadata: {
      terminalEvidence: {
        version: "landing-terminal-evidence-v1",
        detection: {
          observedAt: new Date(at).toISOString(), onGround: true, lat: 50.1, lon: 14.26,
          altitudeFt: 0, baroAltitudeFt: 0, geomAltitudeFt: null, groundSpeedKt: 30,
          trackDeg: 240, verticalRateFpm: 0, baroRateFpm: 0, geomRateFpm: null,
          seenSeconds: 0, seenPosSeconds: 0, source: "ADS-B", origin: "local",
        },
        recentTrack: [],
        groundConfirmation: null,
        reportedArrivalRunway: runway ? { runway, provider: "FLIGHTAWARE", retrievedAt: new Date(at).toISOString() } : null,
        destinationObservation: null,
      },
    },
  };
}

function slice(input: Partial<OperationalTwinEventOutcomeSlice> = {}): OperationalTwinEventOutcomeSlice {
  return {
    predictions: 100,
    scoreable: 90,
    observed: 75,
    falsePositive: 15,
    precision: 0.8333,
    expiredNoTruth: 5,
    unscoreableTruth: 5,
    missingTruthRate: 0.1,
    timingSamples: 75,
    meanSignedTimingErrorSeconds: 20,
    meanAbsoluteTimingErrorSeconds: 120,
    within120Seconds: 50,
    within120SecondsRate: 0.6667,
    within300Seconds: 70,
    within300SecondsRate: 0.9333,
    ...input,
  };
}

describe("Operational Digital Twin Event Outcome Validation V2", () => {
  it("scores waypoint timing from future LOCAL receiver truth", () => {
    const validator = new OperationalTwinEventOutcomeValidator();
    const predictedAt = baseNow + 5 * 60_000;
    validator.capture(situation([
      event("WAYPOINT", 5, { id: `waypoint:VLM:${new Date(predictedAt).toISOString()}`, title: "VLM", lat: 49, lon: 17.5 }),
    ]), { atcDataset: null, sigmets: null, destination: null });

    const truth = aircraft(predictedAt + 30_000, 49, 17.5);
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), predictedAt + 31_000);

    const report = validator.report(new Date(predictedAt + 31_000));
    expect(report.overall.observed).toBe(1);
    expect(report.overall.falsePositive).toBe(0);
    expect(report.overall.meanSignedTimingErrorSeconds).toBe(30);
    expect(report.byType.WAYPOINT.observed).toBe(1);
    expect(report.decision).toBe("WAIT");
  });

  it("keeps the local-truth index bounded when pending outcomes outlive observations", () => {
    const validator = new OperationalTwinEventOutcomeValidator();
    for (let index = 0; index < 200; index += 1) {
      const current = situation([
        event("WAYPOINT", 5, {
          id: `waypoint:VLM-${index}:${new Date(baseNow + index).toISOString()}`,
          title: `VLM-${index}`,
          lat: 49 + index / 10_000,
          lon: 17.5,
        }),
      ]);
      current.aircraft.icaoHex = (0xabc000 + index).toString(16).toUpperCase();
      validator.capture(current, { atcDataset: null, sigmets: null, destination: null });
    }

    const internals = validator as unknown as {
      pending: Map<string, unknown>;
      pendingByAircraft: Map<string, Set<string>>;
    };
    expect(internals.pending.size).toBe(200);
    expect(internals.pendingByAircraft.size).toBe(200);

    validator.observeLocal(new Map(), baseNow + 60_000);
    expect(internals.pending.size).toBe(200);
    expect(internals.pendingByAircraft.size).toBe(200);

    validator.observeLocal(new Map(), baseNow + 14 * 60_000);
    expect(internals.pending.size).toBe(0);
    expect(internals.pendingByAircraft.size).toBe(0);
  });

  it("validates a predicted ATC sector entry against published geometry and LOCAL position", () => {
    const dataset = prepareAtcContextDataset({
      sectors: [{
        id: "TEST-SECTOR",
        name: "Test Sector",
        atcCallsign: "TEST",
        airspaceType: "CTA_SECTOR",
        airspaceClass: "C",
        polygons: [[[17.4, 48.9], [17.6, 48.9], [17.6, 49.1], [17.4, 49.1], [17.4, 48.9]]],
        lowerAltitudeFt: 0,
        upperAltitudeFt: 40000,
        frequencies: [],
        validFrom: null,
        validTo: null,
        country: "CZ",
        source: "test",
        sourceReference: "test",
        lastVerifiedAt: new Date(baseNow).toISOString(),
      }],
      routeDocuments: [],
    });
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("ATC_SECTOR_ENTRY", 5, { id: `sector:TEST-SECTOR:${new Date(predictedAt).toISOString()}`, title: "Test Sector", lat: 49, lon: 17.5 }),
    ]), { atcDataset: dataset, sigmets: null, destination: null });

    const truth = aircraft(predictedAt + 20_000, 49, 17.5);
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), predictedAt + 21_000);

    expect(validator.report(new Date(predictedAt + 21_000)).byType.ATC_SECTOR_ENTRY.observed).toBe(1);
  });

  it("matches full ATC current-sector truth for boundaries, vertical bands and invalid fixes", () => {
    const sector = testAtcDataset().sectors[0]!;
    const dataset = prepareAtcContextDataset({
      sectors: [
        sector,
        { ...sector, id: "HIGH", name: "High airspace", lowerAltitudeFt: 35000, upperAltitudeFt: 45000,
          lowerAltitudeReference: "FL", upperAltitudeReference: "FL" },
        { ...sector, id: "AGL", name: "AGL airspace", lowerAltitudeFt: 30000, upperAltitudeFt: 35000,
          lowerAltitudeReference: "AGL", upperAltitudeReference: "AGL" },
      ],
      routeDocuments: [],
    });
    const basic = {
      lat: 49, lon: 17.5, altitude: 30000, baroAltitude: 30000, geomAltitude: 30000,
      altitudeSource: "baro" as const, track: 90, groundSpeed: 420, verticalRate: 0,
      timestamp: new Date(baseNow).toISOString(), onGround: false,
    };
    const variants = [
      basic,
      { ...basic, lon: 17.4 }, // polygon boundary
      { ...basic, lon: 17.6 },
      { ...basic, lon: 18.5 },
      { ...basic, altitude: 40000, baroAltitude: 40000, geomAltitude: 40000 },
      { ...basic, altitude: null, baroAltitude: null, geomAltitude: null },
      { ...basic, baroAltitude: null, geomAltitude: null, altitudeSource: "none" as const },
      { ...basic, track: null, groundSpeed: null, onGround: true },
      { ...basic, lat: 0, lon: 0 },
      { ...basic, lon: Number.NaN },
    ];
    for (const input of variants) {
      const reference = computeAtcContext(input, dataset, new Date(baseNow));
      const referenceIds = new Set(reference.currentAirspaces.map((airspace) => airspace.id));
      expect(getCurrentAtcSectorIds(input, dataset)).toEqual(referenceIds);
    }
  });

  it("shares one ATC truth lookup across sector predictions for the same point", () => {
    const dataset = prepareAtcContextDataset({
      sectors: ["A", "B"].map((id) => ({
        id,
        name: id,
        atcCallsign: id,
        airspaceType: "CTA_SECTOR",
        airspaceClass: "C",
        polygons: [[[17.4, 48.9], [17.6, 48.9], [17.6, 49.1], [17.4, 49.1], [17.4, 48.9]]],
        lowerAltitudeFt: 0,
        upperAltitudeFt: 40000,
        frequencies: [],
        validFrom: null,
        validTo: null,
        country: "CZ",
        source: "test",
        sourceReference: "test",
        lastVerifiedAt: new Date(baseNow).toISOString(),
      })),
      routeDocuments: [],
    });
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    vi.mocked(computeAtcContext).mockClear();
    validator.capture(situation([
      event("ATC_SECTOR_ENTRY", 5, { id: `sector:A:${predictedAt}`, title: "A", lat: 49, lon: 17.5 }),
      event("ATC_SECTOR_ENTRY", 5, { id: `sector:B:${predictedAt}`, title: "B", lat: 49, lon: 17.5 }),
    ]), { atcDataset: dataset, sigmets: null, destination: null });

    const truth = aircraft(predictedAt + 20_000, 49, 17.5);
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), predictedAt + 21_000);

    expect(validator.report(new Date(predictedAt + 21_000)).byType.ATC_SECTOR_ENTRY.observed).toBe(2);
    expect(computeAtcContext).not.toHaveBeenCalled();
  });

  it("does not repeat ATC truth lookup across unchanged snapshots and newly allocated Aircraft objects", () => {
    const dataset = testAtcDataset();
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("ATC_SECTOR_ENTRY", 5, { id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5 }),
    ]), { atcDataset: dataset, sigmets: null, destination: null });
    const first = aircraft(baseNow, 49, 18.5);
    vi.mocked(computeAtcContext).mockClear();
    validator.observeLocal(new Map([[first.icaoHex, first]]), baseNow + 60_000);
    const second = { ...first, trail: [...first.trail] };
    validator.observeLocal(new Map([[second.icaoHex, second]]), baseNow + 120_000);
    expect(computeAtcContext).not.toHaveBeenCalled();
    expect(validator.getAtcCacheStats()).toMatchObject({ hits: 0, misses: 1, size: 1 });
    expect(validator.report(new Date(baseNow + 120_000)).performance.pendingEntriesWithoutNewTruth).toBe(1);
  });

  it("evaluates newly captured outcomes when the local truth is unchanged", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    const context = { atcDataset: null, sigmets: null, destination: null };
    const plane = aircraft(predictedAt, 49, 17.5);
    const local = new Map([[plane.icaoHex, plane]]);
    validator.capture(situation([
      event("WAYPOINT", 5, { id: "waypoint:FAR", title: "FAR", lat: 49, lon: 18.5 }),
    ]), context, baseNow);
    validator.observeLocal(local, baseNow + 1_000);
    expect(validator.report(new Date(baseNow + 1_000)).pending).toBe(1);

    validator.capture(situation([
      event("WAYPOINT", 5, { id: "waypoint:NEAR", title: "NEAR", lat: 49, lon: 17.5 }),
    ]), context, baseNow + 10_000);
    validator.observeLocal(local, baseNow + 11_000);
    const report = validator.report(new Date(baseNow + 11_000));
    expect(report.byType.WAYPOINT.observed).toBe(1);
    expect(report.pending).toBe(1);
    expect(report.performance.pendingEntriesWithoutNewTruth).toBeGreaterThan(0);
  });

  it("does not rescan unchanged local truth points for pending events", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("WAYPOINT", 5, { id: `waypoint:VLM:${predictedAt}`, title: "VLM", lat: 49, lon: 17.5 }),
    ]), { atcDataset: null, sigmets: null, destination: null });

    const first = aircraft(baseNow, 49, 18.5);
    first.trail = Array.from({ length: 120 }, (_, index) => ({
      recordedAt: new Date(baseNow - (119 - index) * 1_000).toISOString(),
      lat: 49,
      lon: 18.5,
      altitude: 30000,
      track: 90,
      groundSpeed: 420,
    }));
    validator.observeLocal(new Map([[first.icaoHex, first]]), baseNow + 60_000);
    const firstReport = validator.report(new Date(baseNow + 60_000));

    validator.observeLocal(new Map([[first.icaoHex, { ...first, trail: [...first.trail] }]]), baseNow + 120_000);
    const secondReport = validator.report(new Date(baseNow + 120_000));

    expect(secondReport.overall).toEqual(firstReport.overall);
    expect(secondReport.performance.evaluatedTruthPoints).toBe(firstReport.performance.evaluatedTruthPoints);
    expect(secondReport.performance.pendingEntriesWithoutNewTruth).toBe(1);
  });

  it("reuses canonical point identities for many pending events and rechecks corrected older truth", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const events = [17.5, 17.6, 17.7, 17.8].map((lon, index) =>
      event("WAYPOINT", 5, { id: `waypoint:FINGERPRINT-${index}`, title: `FINGERPRINT-${index}`, lat: 49, lon }));
    const optimized = new OperationalTwinEventOutcomeValidator();
    const reference = new OperationalTwinEventOutcomeValidator({ enableIncrementalTruthEvaluation: false });
    const context = { atcDataset: null, sigmets: null, destination: null };
    optimized.capture(situation(events), context);
    reference.capture(situation(events), context);
    const first = aircraft(baseNow + 4 * 60_000, 49, 18.5);
    first.trail = Array.from({ length: 120 }, (_, index) => ({
      recordedAt: new Date(baseNow + index * 2_000).toISOString(),
      lat: 49, lon: 18.5, altitude: 30_000, track: 90, groundSpeed: 420,
    }));
    const observe = (plane: Aircraft, at: number) => {
      const local = new Map([[plane.icaoHex, plane]]);
      optimized.observeLocal(local, at);
      reference.observeLocal(local, at);
    };
    observe(first, baseNow + 4 * 60_000);
    const internals = optimized as unknown as {
      truthStates: Map<string, { points: unknown[]; pointFingerprints: readonly string[] }>;
    };
    const before = internals.truthStates.get("ABC123");
    expect(before).toBeDefined();
    expect(before?.pointFingerprints).toHaveLength(before?.points.length ?? 0);

    // A same-content replacement reuses the identities rather than rebuilding.
    observe({ ...first, trail: [...first.trail] }, baseNow + 4 * 60_000 + 1_000);
    expect(internals.truthStates.get("ABC123")?.pointFingerprints).toBe(before?.pointFingerprints);

    // The corrected historical point must still be evaluated despite the
    // timestamp cursor already advancing to a newer point.
    const corrected: Aircraft = { ...first, trail: first.trail.map((point, index) =>
      index === 25 ? { ...point, lon: 17.5 } : point) };
    observe(corrected, baseNow + 4 * 60_000 + 2_000);
    const after = internals.truthStates.get("ABC123");
    expect(after?.pointFingerprints).not.toBe(before?.pointFingerprints);
    expect(after?.pointFingerprints[25]).not.toBe(before?.pointFingerprints[25]);
    const optimizedReport = optimized.report(new Date(predictedAt));
    const referenceReport = reference.report(new Date(predictedAt));
    expect(optimizedReport.overall).toEqual(referenceReport.overall);
    expect(optimizedReport.pending).toBe(referenceReport.pending);
    expect(optimizedReport.byType.WAYPOINT.observed).toBe(1);
  });

  it("keeps canonical truth unchanged when provider ages change but positionObservedAt does not", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("WAYPOINT", 5, { id: `waypoint:VLM:${predictedAt}`, title: "VLM", lat: 49, lon: 17.5 }),
    ]), { atcDataset: null, sigmets: null, destination: null });

    const first = aircraft(baseNow, 49, 18.5);
    first.trail = [{ recordedAt: new Date(baseNow).toISOString(), lat: 49, lon: 18.5, altitude: 30000, track: 90, groundSpeed: 420 }];
    validator.observeLocal(new Map([[first.icaoHex, first]]), baseNow + 30_000);
    const builds = validator.report(new Date(baseNow + 30_000)).performance.truthPointBuilds;

    const second = { ...first, lastSeen: new Date(baseNow + 1_000).toISOString(), seenSeconds: 0, seenPosSeconds: 1 };
    validator.observeLocal(new Map([[second.icaoHex, second]]), baseNow + 31_000);
    const performance = validator.report(new Date(baseNow + 31_000)).performance;
    expect(performance.truthPointBuilds).toBe(builds);
    expect(performance.unchangedTruthStateReuses).toBe(1);
  });

  it("matches the full-scan reference across trail corrections, duplicates, reordering, and replacement", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const events = [
      event("WAYPOINT", 5, { id: `waypoint:OLDER:${predictedAt}`, title: "OLDER", lat: 49, lon: 17.5 }),
      event("WAYPOINT", 5, { id: `waypoint:LATEST:${predictedAt}`, title: "LATEST", lat: 49, lon: 17.6 }),
      event("WAYPOINT", 5, { id: `waypoint:INSERTED:${predictedAt}`, title: "INSERTED", lat: 49, lon: 17.7 }),
      event("WAYPOINT", 5, { id: `waypoint:REPLACED:${predictedAt}`, title: "REPLACED", lat: 49, lon: 17.8 }),
    ];
    const captured = situation(events);
    const context = { atcDataset: null, sigmets: null, destination: null };
    const incremental = new OperationalTwinEventOutcomeValidator();
    const fullScan = new OperationalTwinEventOutcomeValidator({
      enableIncrementalTruthEvaluation: false,
      enableExpiryQueue: false,
    });
    incremental.capture(captured, context);
    fullScan.capture(captured, context);

    const point = (at: number, lon: number) => ({
      recordedAt: new Date(at).toISOString(),
      lat: 49,
      lon,
      altitude: 30000,
      track: 90,
      groundSpeed: 420,
    });
    const snapshot = (trail: ReturnType<typeof point>[]) => {
      const current = aircraft(baseNow, 49, 18.5);
      current.lat = null;
      current.lon = null;
      current.trail = trail;
      return new Map([[current.icaoHex, current]]);
    };
    const semanticReport = (validator: OperationalTwinEventOutcomeValidator, at: number) => {
      const semantic = { ...validator.report(new Date(at)) };
      delete (semantic as { performance?: unknown }).performance;
      return semantic;
    };
    const t1 = predictedAt - 30_000;
    const t2 = predictedAt + 30_000;
    const snapshots = [
      // Out-of-order source order and a duplicate timestamp whose first value wins.
      snapshot([point(t2, 18.5), point(t1, 18.5), point(t1, 18.5)]),
      // Correct an older duplicate timestamp while the newest point is unchanged.
      snapshot([point(t2, 18.5), point(t1, 17.5), point(t1, 18.5)]),
      // Correct the newest point at the same timestamp.
      snapshot([point(t2, 17.6), point(t1, 17.5), point(t1, 18.5)]),
      // Insert an out-of-order point between the existing timestamps.
      snapshot([point(t2, 17.6), point(predictedAt, 17.7), point(t1, 17.5), point(t1, 18.5)]),
      // Replace the trail with a shorter history while preserving the newest timestamp.
      snapshot([point(t2, 17.8), point(t1, 18.5)]),
    ];

    for (const [index, local] of snapshots.entries()) {
      const observedAt = baseNow + (index + 1) * 60_000;
      incremental.observeLocal(local, observedAt);
      fullScan.observeLocal(local, observedAt);
      expect(semanticReport(incremental, observedAt)).toEqual(semanticReport(fullScan, observedAt));
    }
    expect(incremental.report(new Date(baseNow + 6 * 60_000)).overall.observed).toBe(4);
  });

  it("distinguishes continuity-backed false positives from missing truth", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("WAYPOINT", 5, { id: `waypoint:MISS:${predictedAt}`, title: "MISS", lat: 49, lon: 17.5 }),
    ]), { atcDataset: null, sigmets: null, destination: null });

    const wrongPoint = (at: number) => ({
      recordedAt: new Date(at).toISOString(),
      lat: 49,
      lon: 17.6,
      altitude: 30000,
      track: 90,
      groundSpeed: 420,
    });
    const first = aircraft(baseNow, 49, 18.5);
    first.lat = null;
    first.lon = null;
    first.trail = [wrongPoint(predictedAt)];
    validator.observeLocal(new Map([[first.icaoHex, first]]), predictedAt);

    const nearExpiry = { ...first, trail: [wrongPoint(predictedAt + 8 * 60_000)] };
    validator.observeLocal(new Map([[nearExpiry.icaoHex, nearExpiry]]), predictedAt + 8 * 60_000);
    validator.observeLocal(new Map(), predictedAt + 8 * 60_000 + 1);

    const report = validator.report(new Date(predictedAt + 8 * 60_000 + 1));
    expect(report.overall.falsePositive).toBe(1);
    expect(report.overall.expiredNoTruth).toBe(0);
  });

  it("keeps prepared dataset maps immutable without freezing provider-owned input", () => {
    const immutablePolygon: SectorPolygon = [[17.4, 48.9], [17.6, 48.9], [17.6, 49.1], [17.4, 49.1], [17.4, 48.9]];
    const source = {
      sectors: [{
        id: "IMMUTABLE",
        name: "Immutable",
        atcCallsign: "IMMUTABLE",
        airspaceType: "CTA_SECTOR",
        airspaceClass: "C",
        polygons: [immutablePolygon],
        lowerAltitudeFt: 0,
        upperAltitudeFt: 40000,
        frequencies: [], validFrom: null, validTo: null, country: "CZ",
        source: "test", sourceReference: "test", lastVerifiedAt: new Date(baseNow).toISOString(),
      }],
      routeDocuments: [],
    };
    const prepared = prepareAtcContextDataset(source);
    expect(() => (prepared.atcGrid as Map<string, number[]>).set("mutated", [0])).toThrow(TypeError);
    expect(() => (prepared.atcGrid as Map<string, number[]>).clear()).toThrow(TypeError);
    expect(Object.isFrozen(prepared.sectors[0])).toBe(true);
    expect(Object.isFrozen(source.sectors[0])).toBe(false);
    source.sectors[0].name = "provider refresh";
    expect(prepared.sectors[0].name).toBe("Immutable");
  });

  it("shares same-timestamp truth between different ICAOs when the point is identical", () => {
    const dataset = testAtcDataset();
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    const west = situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5 })]);
    const east = situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:TARGET:${predictedAt}:east`, lat: 49, lon: 17.5 })]);
    east.aircraft.icaoHex = "EAST01";
    validator.capture(west, { atcDataset: dataset, sigmets: null, destination: null });
    validator.capture(east, { atcDataset: dataset, sigmets: null, destination: null });
    const westTruth = aircraft(baseNow, 49, 18.5);
    const eastTruth = { ...aircraft(baseNow, 49, 18.5), icaoHex: "EAST01" };
    vi.mocked(computeAtcContext).mockClear();
    validator.observeLocal(new Map([["ABC123", westTruth], ["EAST01", eastTruth]]), baseNow + 60_000);
    expect(computeAtcContext).not.toHaveBeenCalled();
    expect(validator.getAtcCacheStats()).toMatchObject({ hits: 1, misses: 1 });
  });

  it("reuses sector truth when only time, heading and groundspeed change", () => {
    const dataset = testAtcDataset();
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([event("ATC_SECTOR_ENTRY", 5, {
      id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5,
    })]), { atcDataset: dataset, sigmets: null, destination: null });

    const first = aircraft(baseNow, 49, 18.5);
    const second = aircraft(baseNow + 1_000, 49, 18.5);
    second.track = 270;
    second.groundSpeed = 250;

    validator.observeLocal(new Map([[first.icaoHex, first]]), baseNow + 60_000);
    validator.observeLocal(new Map([[second.icaoHex, second]]), baseNow + 120_000);
    expect(validator.getAtcCacheStats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
    expect(validator.report(new Date(baseNow + 120_000)).pending).toBe(1);
  });

  it("does not share cached sector truth between different coordinates at the same timestamp", () => {
    const dataset = testAtcDataset();
    const validator = new OperationalTwinEventOutcomeValidator();
    const predictedAt = baseNow + 5 * 60_000;
    for (const icaoHex of ["ABC123", "DIFF02", "SAME03"]) {
      const current = situation([event("ATC_SECTOR_ENTRY", 5, {
        id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5,
      })]);
      current.aircraft.icaoHex = icaoHex;
      validator.capture(current, { atcDataset: dataset, sigmets: null, destination: null });
    }
    const originals = new Map([
      ["ABC123", aircraft(baseNow, 49, 18.5)],
      ["DIFF02", { ...aircraft(baseNow, 49, 18.6), icaoHex: "DIFF02" }],
      ["SAME03", { ...aircraft(baseNow, 49, 18.5), icaoHex: "SAME03" }],
    ]);
    validator.observeLocal(originals, baseNow + 60_000);
    expect(validator.getAtcCacheStats()).toMatchObject({ hits: 1, misses: 2, size: 2 });
    expect(validator.report(new Date(baseNow + 60_000)).pending).toBe(3);
  });

  it("invalidates a same-timestamp cache entry when the position is corrected", () => {
    const dataset = testAtcDataset();
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5 })]), { atcDataset: dataset, sigmets: null, destination: null });
    const wrong = aircraft(baseNow, 49, 18.5);
    const corrected = aircraft(baseNow, 49, 17.5);
    vi.mocked(computeAtcContext).mockClear();
    validator.observeLocal(new Map([[wrong.icaoHex, wrong]]), baseNow + 60_000);
    validator.observeLocal(new Map([[corrected.icaoHex, corrected]]), baseNow + 120_000);
    expect(computeAtcContext).not.toHaveBeenCalled();
    expect(validator.report(new Date(baseNow + 120_000)).byType.ATC_SECTOR_ENTRY.observed).toBe(1);
  });

  it("uses a new ATC dataset identity instead of an old sector result", () => {
    const firstDataset = testAtcDataset("FIRST");
    const secondDataset = testAtcDataset("SECOND", 18.4, 18.6);
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    const first = situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:FIRST:${predictedAt}`, lat: 49, lon: 17.5 })]);
    const second = situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:SECOND:${predictedAt}`, lat: 49, lon: 18.5 })]);
    second.aircraft.icaoHex = "SECOND1";
    validator.capture(first, { atcDataset: firstDataset, sigmets: null, destination: null });
    validator.capture(second, { atcDataset: secondDataset, sigmets: null, destination: null });
    const firstTruth = aircraft(baseNow, 49, 17.5);
    const secondTruth = { ...aircraft(baseNow, 49, 17.5), icaoHex: "SECOND1" };
    vi.mocked(computeAtcContext).mockClear();
    validator.observeLocal(new Map([["ABC123", firstTruth], ["SECOND1", secondTruth]]), baseNow + 60_000);
    expect(computeAtcContext).not.toHaveBeenCalled();
    expect(validator.getAtcCacheStats().hits).toBe(0);
  });

  it("evaluates a newly captured pending event against an existing historical trail", () => {
    const dataset = testAtcDataset();
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    const truth = aircraft(baseNow, 49, 17.5);
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), baseNow + 60_000);
    validator.capture(situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5 })]), { atcDataset: dataset, sigmets: null, destination: null });
    validator.observeLocal(new Map([[truth.icaoHex, { ...truth, trail: [...truth.trail] }]]), baseNow + 120_000);
    expect(validator.report(new Date(baseNow + 120_000)).byType.ATC_SECTOR_ENTRY.observed).toBe(1);
  });

  it("sorts out-of-order trail points before evaluating continuity and truth", () => {
    const dataset = testAtcDataset();
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5 })]), { atcDataset: dataset, sigmets: null, destination: null });
    const truth = aircraft(baseNow, null as unknown as number, null as unknown as number);
    truth.lat = null;
    truth.lon = null;
    truth.trail = [
      { recordedAt: new Date(predictedAt + 30_000).toISOString(), lat: 49, lon: 18.5, altitude: 30000, track: 90, groundSpeed: 420 },
      { recordedAt: new Date(predictedAt - 30_000).toISOString(), lat: 49, lon: 17.5, altitude: 30000, track: 90, groundSpeed: 420 },
    ];
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), baseNow + 60_000);
    expect(validator.report(new Date(baseNow + 60_000)).byType.ATC_SECTOR_ENTRY.observed).toBe(1);
  });

  it("expires and resets the bounded ATC cache", () => {
    const dataset = testAtcDataset();
    const predictedAt = baseNow + 60 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([event("ATC_SECTOR_ENTRY", 60, { id: `sector:TARGET:${predictedAt}`, lat: 49, lon: 17.5 })]), { atcDataset: dataset, sigmets: null, destination: null });
    const truth = aircraft(predictedAt - 60_000, 49, 18.5);
    vi.mocked(computeAtcContext).mockClear();
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), baseNow + 60_000);
    const ttl = validator.getAtcCacheStats().ttlMs;
    validator.observeLocal(new Map([[truth.icaoHex, { ...truth, trail: [...truth.trail] }]]), baseNow + ttl + 120_000);
    expect(validator.getAtcCacheStats().expirations).toBeGreaterThan(0);
    validator.reset();
    expect(validator.getAtcCacheStats()).toMatchObject({ hits: 0, misses: 0, size: 0, evictions: 0, expirations: 0 });
  });

  it("enforces the configured maximum cache capacity", () => {
    const dataset = testAtcDataset();
    const validator = new OperationalTwinEventOutcomeValidator({ atcTruthCacheMaxEntries: 2 });
    for (const [index, icaoHex] of ["A00001", "A00002", "A00003"].entries()) {
      const current = situation([event("ATC_SECTOR_ENTRY", 5, { id: `sector:TARGET:${baseNow + 5 * 60_000}:${index}`, lat: 49, lon: 18.5 })]);
      current.aircraft.icaoHex = icaoHex;
      validator.capture(current, { atcDataset: dataset, sigmets: null, destination: null });
      // Capacity is keyed by distinct truth positions, not observation times.
      // Identical positions are deliberately shared by the optimized cache.
      const truth = { ...aircraft(baseNow + index * 1_000, 49, 18.5 + index * 0.1), icaoHex };
      validator.observeLocal(new Map([[icaoHex, truth]]), baseNow + 60_000 + index);
    }
    expect(validator.getAtcCacheStats()).toMatchObject({
      size: 2, maxEntries: 2, evictions: 1, hits: 0, misses: 3,
    });
  });

  it("does not share sector truth between aircraft at different points", () => {
    const dataset = prepareAtcContextDataset({
      sectors: [
        {
          id: "WEST",
          name: "West",
          atcCallsign: "WEST",
          airspaceType: "CTA_SECTOR",
          airspaceClass: "C",
          polygons: [[[17.4, 48.9], [17.6, 48.9], [17.6, 49.1], [17.4, 49.1], [17.4, 48.9]]],
          lowerAltitudeFt: 0,
          upperAltitudeFt: 40000,
          frequencies: [], validFrom: null, validTo: null, country: "CZ",
          source: "test", sourceReference: "test", lastVerifiedAt: new Date(baseNow).toISOString(),
        },
        {
          id: "EAST",
          name: "East",
          atcCallsign: "EAST",
          airspaceType: "CTA_SECTOR",
          airspaceClass: "C",
          polygons: [[[18.4, 48.9], [18.6, 48.9], [18.6, 49.1], [18.4, 49.1], [18.4, 48.9]]],
          lowerAltitudeFt: 0,
          upperAltitudeFt: 40000,
          frequencies: [], validFrom: null, validTo: null, country: "CZ",
          source: "test", sourceReference: "test", lastVerifiedAt: new Date(baseNow).toISOString(),
        },
      ],
      routeDocuments: [],
    });
    const predictedAt = baseNow + 5 * 60_000;
    const west = situation([
      event("ATC_SECTOR_ENTRY", 5, { id: `sector:WEST:${predictedAt}`, title: "West", lat: 49, lon: 17.5 }),
    ]);
    west.aircraft.icaoHex = "WEST01";
    const east = situation([
      event("ATC_SECTOR_ENTRY", 5, { id: `sector:EAST:${predictedAt}`, title: "East", lat: 49, lon: 18.5 }),
    ]);
    east.aircraft.icaoHex = "EAST01";
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(west, { atcDataset: dataset, sigmets: null, destination: null });
    validator.capture(east, { atcDataset: dataset, sigmets: null, destination: null });
    vi.mocked(computeAtcContext).mockClear();

    const westTruth = aircraft(predictedAt + 20_000, 49, 17.5);
    westTruth.icaoHex = "WEST01";
    const eastTruth = aircraft(predictedAt + 20_000, 49, 18.5);
    eastTruth.icaoHex = "EAST01";
    validator.observeLocal(new Map([
      [westTruth.icaoHex, westTruth],
      [eastTruth.icaoHex, eastTruth],
    ]), predictedAt + 21_000);

    const report = validator.report(new Date(predictedAt + 21_000));
    expect(report.byType.ATC_SECTOR_ENTRY.observed).toBe(2);
    expect(computeAtcContext).not.toHaveBeenCalled();
  });

  it("validates a predicted SIGMET intersection against captured geometry and LOCAL truth", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const sigmets: SigmetSnapshot = {
      type: "FeatureCollection",
      fetchedAt: new Date(baseNow).toISOString(),
      stale: false,
      features: [{
        type: "Feature",
        id: "SIG-1",
        properties: {
          id: "SIG-1",
          issuingOffice: "LKAA",
          firId: "LKAA",
          firName: "PRAHA FIR",
          phenomenon: "TURB",
          hazard: "TURBULENCE",
          qualifier: null,
          validFrom: new Date(baseNow - 60_000).toISOString(),
          validTo: new Date(baseNow + 60 * 60_000).toISOString(),
          lowerFt: 20000,
          upperFt: 40000,
          seriesId: "A1",
          rawText: null,
          source: "isigmet",
          fetchedAt: new Date(baseNow).toISOString(),
        },
        geometry: {
          type: "Polygon",
          coordinates: [[[17.4, 48.9], [17.6, 48.9], [17.6, 49.1], [17.4, 49.1], [17.4, 48.9]]],
        },
      }],
    };
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("SIGMET_INTERSECTION", 5, { id: `sigmet:SIG-1:${new Date(predictedAt).toISOString()}`, lat: 49, lon: 17.5 }),
    ]), { atcDataset: null, sigmets, destination: null });

    const truth = aircraft(predictedAt - 45_000, 49, 17.5, 30000);
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), predictedAt);

    const report = validator.report(new Date(predictedAt));
    expect(report.byType.SIGMET_INTERSECTION.observed).toBe(1);
    expect(report.byType.SIGMET_INTERSECTION.meanSignedTimingErrorSeconds).toBe(-45);
  });

  it("scores arrival ETA and runway expectation from independent LANDING evidence", () => {
    const predictedAt = baseNow + 10 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("RUNWAY_EXPECTATION", 10, { id: `runway:test:24`, title: "RWY 24", altitudeFt: null }),
      event("ARRIVAL_ETA", 10, { id: `arrival:${new Date(predictedAt).toISOString()}`, title: "Arrival LKPR", altitudeFt: null }),
    ]), { atcDataset: null, sigmets: null, destination: "LKPR" });

    validator.observeIntelligence([landing(predictedAt + 60_000, "LKPR", "24")], predictedAt + 60_000);

    const report = validator.report(new Date(predictedAt + 60_000));
    expect(report.byType.ARRIVAL_ETA.observed).toBe(1);
    expect(report.byType.RUNWAY_EXPECTATION.observed).toBe(1);
    expect(report.byType.RUNWAY_EXPECTATION.falsePositive).toBe(0);
  });

  it("records a runway mismatch as a false positive rather than inventing truth", () => {
    const predictedAt = baseNow + 10 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("RUNWAY_EXPECTATION", 10, { id: "runway:test:24", title: "RWY 24", altitudeFt: null }),
    ]), { atcDataset: null, sigmets: null, destination: "LKPR" });

    validator.observeIntelligence([landing(predictedAt, "LKPR", "06")], predictedAt);
    const report = validator.report(new Date(predictedAt));
    expect(report.byType.RUNWAY_EXPECTATION.observed).toBe(0);
    expect(report.byType.RUNWAY_EXPECTATION.falsePositive).toBe(1);
  });

  it("keeps missing receiver truth separate from false positives", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation([
      event("WAYPOINT", 5, { id: `waypoint:VLM:${new Date(predictedAt).toISOString()}`, title: "VLM", lat: 49, lon: 17.5 }),
    ]), { atcDataset: null, sigmets: null, destination: null });

    validator.observeLocal(new Map(), predictedAt + 9 * 60_000);
    const report = validator.report(new Date(predictedAt + 9 * 60_000));
    expect(report.byType.WAYPOINT.falsePositive).toBe(0);
    expect(report.byType.WAYPOINT.expiredNoTruth).toBe(1);
  });

  it("keeps decision WAIT until span, volume, timing and type diversity gates are complete", () => {
    const byType = {
      WAYPOINT: slice({ scoreable: 8 }),
      ATC_SECTOR_ENTRY: slice({ scoreable: 8 }),
      SIGMET_INTERSECTION: slice({ scoreable: 0 }),
      ARRIVAL_ETA: slice({ scoreable: 0 }),
      RUNWAY_EXPECTATION: slice({ scoreable: 0 }),
    };
    const result = evaluateOperationalTwinEventOutcomeDecision({
      spanMinutes: 30,
      overall: slice({ scoreable: 30, timingSamples: 15 }),
      byType,
    });
    expect(result.decision).toBe("WAIT");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "process_window_insufficient",
      "scoreable_samples_insufficient",
      "observed_timing_samples_insufficient",
      "event_type_diversity_insufficient",
    ]));
  });

  it("fails completed evidence when precision, timing or truth coverage miss thresholds", () => {
    const byType = {
      WAYPOINT: slice({ scoreable: 30 }),
      ATC_SECTOR_ENTRY: slice({ scoreable: 30 }),
      SIGMET_INTERSECTION: slice({ scoreable: 0 }),
      ARRIVAL_ETA: slice({ scoreable: 0 }),
      RUNWAY_EXPECTATION: slice({ scoreable: 0 }),
    };
    const result = evaluateOperationalTwinEventOutcomeDecision({
      spanMinutes: 180,
      overall: slice({ scoreable: 90, timingSamples: 60, precision: 0.6, meanAbsoluteTimingErrorSeconds: 400, missingTruthRate: 0.5 }),
      byType,
    });
    expect(result.complete).toBe(true);
    expect(result.decision).toBe("FAIL");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "prediction_precision_low",
      "timing_error_high",
      "truth_coverage_low",
    ]));
  });

  it("passes calibrated evidence without claiming recall", () => {
    const byType = {
      WAYPOINT: slice({ scoreable: 30 }),
      ATC_SECTOR_ENTRY: slice({ scoreable: 30 }),
      SIGMET_INTERSECTION: slice({ scoreable: 0 }),
      ARRIVAL_ETA: slice({ scoreable: 0 }),
      RUNWAY_EXPECTATION: slice({ scoreable: 0 }),
    };
    expect(evaluateOperationalTwinEventOutcomeDecision({
      spanMinutes: 180,
      overall: slice({ scoreable: 90, timingSamples: 60 }),
      byType,
    })).toEqual({ decision: "PASS", reasons: [], complete: true });
  });
  it("round-trips anonymous event calibration buckets without aircraft-level payload", () => {
    const predictedAt = baseNow + 5 * 60_000;
    const source = new OperationalTwinEventOutcomeValidator();
    source.capture(situation([
      event("WAYPOINT", 5, {
        id: `waypoint:VLM:${new Date(predictedAt).toISOString()}`,
        title: "VLM",
        lat: 49,
        lon: 17.5,
      }),
    ]), { atcDataset: null, sigmets: null, destination: null });
    const truth = aircraft(predictedAt + 30_000, 49, 17.5);
    source.observeLocal(new Map([[truth.icaoHex, truth]]), predictedAt + 31_000);

    const exported = source.exportCalibrationBuckets(predictedAt + 31_000);
    expect(exported.length).toBeGreaterThan(0);
    const serialized = exported.map((row) => row.payloadJson).join("\n");
    expect(serialized).not.toMatch(/ABC123|TEST123|icaoHex|callsign|registration|semanticKey|title|lat|lon/i);

    const restored = new OperationalTwinEventOutcomeValidator();
    expect(restored.hydrateCalibrationBuckets(exported, predictedAt + 31_000)).toBeGreaterThan(0);
    const report = restored.report(new Date(predictedAt + 31_000));
    expect(report.overall.observed).toBe(1);
    expect(report.byType.WAYPOINT.observed).toBe(1);
  });
});
