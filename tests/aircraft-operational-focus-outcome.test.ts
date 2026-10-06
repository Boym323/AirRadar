import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS,
  AircraftOperationalFocusOutcomeValidator,
  evaluateAircraftOperationalFocusOutcome,
} from "@/lib/operational-twin/aircraft-operational-focus-outcome";
import type { OperationalTwinSituation } from "@/lib/operational-twin/types";
import type { SigmetSnapshot } from "@/lib/weather/types";

function sigmets(): SigmetSnapshot {
  return {
    type: "FeatureCollection",
    fetchedAt: "2026-10-06T10:00:00.000Z",
    stale: false,
    features: [{
      type: "Feature",
      id: "SIG1",
      properties: {
        id: "SIG1",
        issuingOffice: "LKAA",
        firId: "LKAA",
        firName: "Praha",
        phenomenon: "TS",
        hazard: "CONVECTION",
        qualifier: null,
        validFrom: "2026-10-06T09:30:00.000Z",
        validTo: "2026-10-06T11:30:00.000Z",
        lowerFt: 20_000,
        upperFt: 40_000,
        seriesId: "SIG1",
        rawText: null,
        source: "isigmet",
        fetchedAt: "2026-10-06T10:00:00.000Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[15.5, 48.5], [16.5, 48.5], [16.5, 49.5], [15.5, 49.5], [15.5, 48.5]]],
      },
    }],
  };
}

function situation(source: "SIGMET" | "PIREP_AIREP" = "SIGMET"): OperationalTwinSituation {
  return {
    version: "operational-digital-twin-v1",
    status: "available",
    generatedAt: "2026-10-06T10:00:00.000Z",
    aircraft: {
      icaoHex: "ABC123",
      callsign: "TEST123",
      registration: null,
      observedAt: "2026-10-06T10:00:00.000Z",
      stateSource: "CANONICAL",
      trackFusionReadiness: null,
    },
    corridor: {
      horizonMinutes: 30,
      stepMinutes: 2,
      mode: "KINEMATIC",
      routeAdherence: null,
      routePrecision: null,
      maxUncertaintyNm: 10,
      points: [
        { offsetMinutes: 0, at: "2026-10-06T10:00:00.000Z", lat: 48.8, lon: 15.5, altitudeFt: 30_000, trackDeg: 90, uncertaintyNm: 1, mode: "KINEMATIC" },
        { offsetMinutes: 5, at: "2026-10-06T10:05:00.000Z", lat: 49, lon: 16, altitudeFt: 30_000, trackDeg: 90, uncertaintyNm: 3, mode: "KINEMATIC" },
      ],
      waypoints: [],
    },
    weatherCorridor: {
      version: "weather-corridor-intelligence-v1",
      status: "AVAILABLE",
      horizonMinutes: 30,
      corridorMode: "KINEMATIC",
      routePrecision: null,
      events: [{
        id: "WX1",
        type: source === "SIGMET" ? "SIGMET_ENTRY" : "TURBULENCE",
        risk: "CONVECTION",
        offsetMinutes: 5,
        at: "2026-10-06T10:05:00.000Z",
        distanceAlongCorridorNm: 20,
        lat: 49,
        lon: 16,
        altitudeFt: 30_000,
        severity: "HIGH",
        confidence: "HIGH",
        source,
        sourceReference: source === "SIGMET" ? "SIG1" : "PIREP1",
        evidence: ["test"],
      }],
      wind: { status: "UNAVAILABLE", model: null, trend: "UNAVAILABLE", deltaAlongTrackKt: null, samples: [] },
      sources: [],
    },
    operationalFocus: {
      version: "aircraft-operational-focus-v1",
      generatedAt: "2026-10-06T10:00:00.000Z",
      level: "ATTENTION",
      total: 1,
      watch: 0,
      attention: 1,
      truncated: false,
      items: [{
        id: "weather:WX1",
        type: "WEATHER",
        level: "ATTENTION",
        offsetMinutes: 5,
        at: "2026-10-06T10:05:00.000Z",
        confidence: "HIGH",
        label: "CONVECTION",
        source,
        sourceReference: source === "SIGMET" ? "SIG1" : "PIREP1",
        reasonCodes: ["WEATHER_HIGH_SEVERITY"],
      }],
      limitations: [
        "OPERATIONAL_CONTEXT_ONLY",
        "NOT_SAFETY_ALERT",
        "NO_ATC_CLEARANCE_INFERENCE",
        "SOURCE_SEMANTICS_PRESERVED",
        "NO_ALL_CLEAR_INFERENCE",
      ],
    },
    events: [],
    evidence: { observed: 1, published: 0, planned: 0, predicted: 0, inferred: 1 },
    limitations: ["BOUNDED_PROJECTION"],
  } as OperationalTwinSituation;
}

function aircraft(lastSeen: string, lat = 49, lon = 16): Aircraft {
  return {
    icaoHex: "ABC123",
    lastSeen,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lat,
    lon,
    baroAltitude: 30_000,
    altitude: 30_000,
    geomAltitude: null,
    onGround: false,
  } as Aircraft;
}

describe("Aircraft Operational Focus Outcome Validation V1", () => {
  it("scores SIGMET-backed WEATHER focus against later LOCAL receiver truth", () => {
    const validator = new AircraftOperationalFocusOutcomeValidator();
    validator.capture(situation(), sigmets(), Date.parse("2026-10-06T10:00:00.000Z"));
    validator.observe(
      [aircraft("2026-10-06T10:05:00.000Z")],
      new Date("2026-10-06T10:05:00.000Z"),
    );

    const report = validator.report(new Date("2026-10-06T10:05:01.000Z"));
    expect(report.overall).toMatchObject({
      predictions: 1,
      scoreable: 1,
      observed: 1,
      falsePositive: 0,
      precision: 1,
      timingSamples: 1,
      meanAbsoluteTimingErrorSeconds: 0,
    });
    expect(report.byLevel.ATTENTION.observed).toBe(1);
  });

  it("does not pretend PIREP-backed WEATHER focus has independent V1 truth", () => {
    const validator = new AircraftOperationalFocusOutcomeValidator();
    validator.capture(situation("PIREP_AIREP"), sigmets(), Date.parse("2026-10-06T10:00:00.000Z"));
    const report = validator.report(new Date("2026-10-06T10:01:00.000Z"));
    expect(report.byType.WEATHER).toMatchObject({
      captures: 1,
      scoreableCaptures: 0,
      unscoredCaptures: 1,
    });
    expect(report.overall.predictions).toBe(0);
  });

  it("separates false positives from missing LOCAL truth", () => {
    const falsePositive = new AircraftOperationalFocusOutcomeValidator();
    falsePositive.capture(situation(), sigmets(), Date.parse("2026-10-06T10:00:00.000Z"));
    falsePositive.observe(
      [aircraft("2026-10-06T10:13:30.000Z", 47, 14)],
      new Date("2026-10-06T10:13:30.000Z"),
    );
    expect(falsePositive.report(new Date("2026-10-06T10:13:31.000Z")).overall.falsePositive).toBe(1);

    const missing = new AircraftOperationalFocusOutcomeValidator();
    missing.capture(situation(), sigmets(), Date.parse("2026-10-06T10:00:00.000Z"));
    missing.observe([], new Date("2026-10-06T10:13:30.000Z"));
    expect(missing.report(new Date("2026-10-06T10:13:31.000Z")).overall.expiredNoTruth).toBe(1);
  });

  it("keeps readiness in WAIT until evidence volume and duration are sufficient", () => {
    const result = evaluateAircraftOperationalFocusOutcome(
      AIRCRAFT_OPERATIONAL_FOCUS_OUTCOME_THRESHOLDS.minimumSpanMinutes - 1,
      {
        predictions: 1,
        scoreable: 1,
        observed: 1,
        falsePositive: 0,
        expiredNoTruth: 0,
        precision: 1,
        missingTruthRate: 0,
        timingSamples: 1,
        meanAbsoluteTimingErrorSeconds: 0,
      },
    );
    expect(result.decision).toBe("WAIT");
    expect(result.reasons).toContain("process_window_insufficient");
    expect(result.reasons).toContain("scoreable_samples_insufficient");
  });
});
