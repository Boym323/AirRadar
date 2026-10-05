import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { prepareAtcContextDataset } from "@/lib/atc-context/engine";
import type { FlightIntelligenceEvent } from "@/lib/intelligence/types";
import {
  OperationalTwinEventOutcomeValidator,
  evaluateOperationalTwinEventOutcomeDecision,
  type OperationalTwinEventOutcomeSlice,
  type OperationalTwinSituation,
} from "@/lib/operational-twin";
import type { SigmetSnapshot } from "@/lib/weather/types";

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
});
