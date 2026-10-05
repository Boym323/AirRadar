import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  OperationalTwinOutcomeValidator,
  evaluateOperationalTwinOutcomeDecision,
  operationalTwinOutcomePointAt,
  type OperationalTwinOutcomeSlice,
  type OperationalTwinSituation,
} from "@/lib/operational-twin";

const baseNow = Date.parse("2026-10-05T10:00:00.000Z");

function situation(stateSource: "CANONICAL" | "TRACK_FUSION" = "CANONICAL"): OperationalTwinSituation {
  return {
    version: "operational-digital-twin-v1",
    status: "available",
    generatedAt: new Date(baseNow).toISOString(),
    aircraft: {
      icaoHex: "ABC123",
      callsign: "TEST123",
      registration: "OK-TST",
      observedAt: new Date(baseNow).toISOString(),
      stateSource,
      trackFusionReadiness: stateSource === "TRACK_FUSION" ? "PASS" : null,
    },
    corridor: {
      horizonMinutes: 30,
      stepMinutes: 10,
      mode: "ROUTE_AWARE",
      routeAdherence: "ON_ROUTE",
      routePrecision: "PRECISE",
      maxUncertaintyNm: 6,
      points: [
        { offsetMinutes: 0, at: new Date(baseNow).toISOString(), lat: 49, lon: 17, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
        { offsetMinutes: 10, at: new Date(baseNow + 10 * 60_000).toISOString(), lat: 49, lon: 17.5, altitudeFt: 29000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" },
        { offsetMinutes: 20, at: new Date(baseNow + 20 * 60_000).toISOString(), lat: 49, lon: 18, altitudeFt: 25000, trackDeg: 90, uncertaintyNm: 4, mode: "ROUTE_AWARE" },
        { offsetMinutes: 30, at: new Date(baseNow + 30 * 60_000).toISOString(), lat: 49, lon: 18.5, altitudeFt: 18000, trackDeg: 90, uncertaintyNm: 6, mode: "ROUTE_AWARE" },
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
    events: [],
    evidence: { observed: 1, published: 0, planned: 0, predicted: 0, inferred: 0 },
    limitations: ["BOUNDED_PROJECTION", "SAMPLED_INTERSECTIONS"],
  };
}

function localTruth(at: number, lon: number, altitude: number): Aircraft {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: null,
    aircraftType: null,
    aircraftDescription: null,
    lat: 49,
    lon,
    altitude,
    baroAltitude: altitude,
    geomAltitude: null,
    groundSpeed: 300,
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

function slice(input: Partial<OperationalTwinOutcomeSlice> = {}): OperationalTwinOutcomeSlice {
  return {
    samples: 90,
    meanPositionErrorNm: 2,
    meanUncertaintyNm: 4,
    meanErrorToUncertaintyRatio: 0.5,
    insideUncertainty: 72,
    uncertaintyCoverage: 0.8,
    altitudeSamples: 80,
    meanAltitudeErrorFt: 400,
    ...input,
  };
}

describe("Operational Digital Twin Outcome Validation V1", () => {
  it("interpolates the 5/15/30 minute truth targets from the bounded corridor", () => {
    const point = operationalTwinOutcomePointAt(situation().corridor.points, 5);
    expect(point?.lon).toBeCloseTo(17.25);
    expect(point?.altitudeFt).toBeCloseTo(29500);
    expect(point?.uncertaintyNm).toBeCloseTo(1.5);
    expect(point?.at).toBe("2026-10-05T10:05:00.000Z");
  });

  it("scores 5/15/30 minute projections against later LOCAL receiver truth", () => {
    const validator = new OperationalTwinOutcomeValidator();
    validator.capture(situation());

    const targets = [
      [5, 17.25, 29500],
      [15, 17.75, 27000],
      [30, 18.5, 18000],
    ] as const;
    for (const [minutes, lon, altitude] of targets) {
      const at = baseNow + minutes * 60_000;
      const truth = localTruth(at, lon, altitude);
      validator.observeTruth(new Map([[truth.icaoHex, truth]]), at + 1_000);
    }

    const report = validator.report(new Date(baseNow + 31 * 60_000));
    expect(report.completed).toBe(3);
    expect(report.pending).toBe(0);
    expect(report.overall.meanPositionErrorNm).toBe(0);
    expect(report.overall.uncertaintyCoverage).toBe(1);
    expect(report.overall.meanAltitudeErrorFt).toBe(0);
    expect(report.horizons["5"]?.samples).toBe(1);
    expect(report.horizons["15"]?.samples).toBe(1);
    expect(report.horizons["30"]?.samples).toBe(1);
    expect(report.modes.ROUTE_AWARE.samples).toBe(3);
    expect(report.stateSources.CANONICAL.samples).toBe(3);
    expect(report.decision).toBe("WAIT");
  });

  it("deduplicates repeated on-demand situation captures inside the bounded interval", () => {
    const validator = new OperationalTwinOutcomeValidator();
    validator.capture(situation(), baseNow);
    validator.capture({ ...situation(), generatedAt: new Date(baseNow + 10_000).toISOString() }, baseNow + 10_000);
    const report = validator.report(new Date(baseNow + 10_000));
    expect(report.created).toBe(3);
    expect(report.pending).toBe(3);
    expect(report.duplicateCaptureSkips).toBe(1);
  });

  it("expires missing LOCAL truth instead of substituting network or canonical merged state", () => {
    const validator = new OperationalTwinOutcomeValidator();
    validator.capture(situation(), baseNow);
    validator.observeTruth(new Map(), baseNow + 31 * 60_000);
    const report = validator.report(new Date(baseNow + 31 * 60_000));
    expect(report.completed).toBe(0);
    expect(report.expiredWithoutTruth).toBe(3);
    expect(report.expiredTruthRate).toBe(1);
    expect(report.truthSource).toBe("LOCAL_RECEIVER");
  });

  it("keeps the outcome decision waiting until minimum evidence is complete", () => {
    const result = evaluateOperationalTwinOutcomeDecision({
      spanMinutes: 30,
      overall: slice({ samples: 30 }),
      horizons: [slice({ samples: 10 }), slice({ samples: 10 }), slice({ samples: 10 })],
      expiredTruthRate: 0.1,
    });
    expect(result.decision).toBe("WAIT");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "process_window_insufficient",
      "samples_insufficient",
      "horizon_samples_insufficient",
    ]));
  });

  it("fails completed evidence when the uncertainty envelope is not calibrated", () => {
    const result = evaluateOperationalTwinOutcomeDecision({
      spanMinutes: 180,
      overall: slice({ uncertaintyCoverage: 0.4, meanErrorToUncertaintyRatio: 1.3 }),
      horizons: [slice({ samples: 30 }), slice({ samples: 30 }), slice({ samples: 30 })],
      expiredTruthRate: 0.4,
    });
    expect(result.complete).toBe(true);
    expect(result.decision).toBe("FAIL");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "uncertainty_coverage_low",
      "mean_error_ratio_high",
      "expired_truth_rate_high",
    ]));
  });

  it("passes only after complete evidence demonstrates calibrated uncertainty and truth continuity", () => {
    const result = evaluateOperationalTwinOutcomeDecision({
      spanMinutes: 180,
      overall: slice(),
      horizons: [slice({ samples: 30 }), slice({ samples: 30 }), slice({ samples: 30 })],
      expiredTruthRate: 0.1,
    });
    expect(result).toEqual({ decision: "PASS", reasons: [], complete: true });
  });
});
