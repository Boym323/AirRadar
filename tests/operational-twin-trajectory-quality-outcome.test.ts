import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  OperationalTwinTrajectoryQualityOutcomeValidator,
  evaluateOperationalTwinTrajectoryQualityOutcome,
  type OperationalTwinSituation,
  type OperationalTwinTrajectoryQualityOutcomeSlice,
} from "@/lib/operational-twin";

const baseNow = Date.parse("2026-10-06T10:00:00.000Z");

function situation(): OperationalTwinSituation {
  const corridorPoints = [
    { offsetMinutes: 0, at: new Date(baseNow).toISOString(), lat: 49, lon: 17, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" as const },
    { offsetMinutes: 10, at: new Date(baseNow + 10 * 60_000).toISOString(), lat: 49, lon: 17.5, altitudeFt: 22000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" as const },
    { offsetMinutes: 20, at: new Date(baseNow + 20 * 60_000).toISOString(), lat: 49, lon: 18, altitudeFt: 16000, trackDeg: 90, uncertaintyNm: 4, mode: "ROUTE_AWARE" as const },
    { offsetMinutes: 30, at: new Date(baseNow + 30 * 60_000).toISOString(), lat: 49, lon: 18.5, altitudeFt: 10000, trackDeg: 90, uncertaintyNm: 6, mode: "ROUTE_AWARE" as const },
  ];

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
      stepMinutes: 10,
      mode: "ROUTE_AWARE",
      routeAdherence: "ON_ROUTE",
      routePrecision: "PRECISE",
      maxUncertaintyNm: 6,
      points: corridorPoints,
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
    trajectoryQualityV2: {
      version: "operational-digital-twin-trajectory-quality-v2",
      status: "AVAILABLE",
      phase: "DESCENT",
      verticalProfile: "RATE_TAPERED",
      points: corridorPoints,
      checkpoints: [
        { offsetMinutes: 5, canonicalAltitudeFt: 26000, qualityAltitudeFt: 27000, altitudeDeltaFt: 1000 },
        { offsetMinutes: 15, canonicalAltitudeFt: 19000, qualityAltitudeFt: 22000, altitudeDeltaFt: 3000 },
        { offsetMinutes: 30, canonicalAltitudeFt: 10000, qualityAltitudeFt: 15000, altitudeDeltaFt: 5000 },
      ],
      canonicalRemainsActive: true,
      autoPromotion: false,
      limitations: ["SHADOW_ONLY", "NO_AIRCRAFT_PERFORMANCE_MODEL", "NO_ATC_CLEARANCE_INFERENCE", "HORIZONTAL_PATH_UNCHANGED", "NOT_FMS_INTENT"],
    },
    events: [],
    evidence: { observed: 1, published: 0, planned: 0, predicted: 0, inferred: 0 },
    limitations: ["BOUNDED_PROJECTION", "SAMPLED_INTERSECTIONS"],
  };
}

function localTruth(at: number, altitude: number): Aircraft {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: null,
    aircraftType: null,
    aircraftDescription: null,
    lat: 49,
    lon: 17,
    altitude,
    baroAltitude: altitude,
    geomAltitude: null,
    groundSpeed: 300,
    track: 90,
    verticalRate: -800,
    baroRate: -800,
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

function slice(pairedSamples: number): OperationalTwinTrajectoryQualityOutcomeSlice {
  return {
    pairedSamples,
    canonicalMeanAbsoluteErrorFt: 2000,
    qualityMeanAbsoluteErrorFt: 1200,
    meanImprovementFt: 800,
    relativeMaeImprovement: 0.4,
    qualityWins: 8,
    canonicalWins: 2,
    ties: 0,
    qualityWinRate: 0.8,
  };
}

describe("Trajectory Quality Outcome Validation V1", () => {
  it("scores canonical and V2 shadow against the same later LOCAL altitude truth", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeValidator();
    validator.capture(situation(), baseNow);

    for (const [minutes, altitude] of [[5, 27000], [15, 22000], [30, 15000]] as const) {
      const at = baseNow + minutes * 60_000;
      const truth = localTruth(at, altitude);
      validator.observeTruth(new Map([[truth.icaoHex, truth]]), at + 1_000);
    }

    const report = validator.report(new Date(baseNow + 31 * 60_000));
    expect(report.completed).toBe(3);
    expect(report.pending).toBe(0);
    expect(report.overall.pairedSamples).toBe(3);
    expect(report.overall.qualityMeanAbsoluteErrorFt).toBe(0);
    expect(report.overall.canonicalMeanAbsoluteErrorFt).toBe(3000);
    expect(report.overall.qualityWinRate).toBe(1);
    expect(report.horizons["5"]?.pairedSamples).toBe(1);
    expect(report.horizons["15"]?.pairedSamples).toBe(1);
    expect(report.horizons["30"]?.pairedSamples).toBe(1);
    expect(report.phases.DESCENT.pairedSamples).toBe(3);
    expect(report.truthSource).toBe("LOCAL_RECEIVER");
    expect(report.canonicalRemainsActive).toBe(true);
    expect(report.autoPromotion).toBe(false);
    expect(report.decision).toBe("WAIT");
  });

  it("deduplicates repeated captures inside one minute", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeValidator();
    validator.capture(situation(), baseNow);
    validator.capture({ ...situation(), generatedAt: new Date(baseNow + 10_000).toISOString() }, baseNow + 10_000);
    const report = validator.report(new Date(baseNow + 10_000));
    expect(report.created).toBe(3);
    expect(report.pending).toBe(3);
    expect(report.duplicateCaptureSkips).toBe(1);
  });

  it("expires missing LOCAL truth and reports truth coverage", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeValidator();
    validator.capture(situation(), baseNow);
    validator.observeTruth(new Map(), baseNow + 31 * 60_000);
    const report = validator.report(new Date(baseNow + 31 * 60_000));
    expect(report.completed).toBe(0);
    expect(report.expiredWithoutTruth).toBe(3);
    expect(report.truthCoverage).toBe(0);
  });

  it("keeps outcome readiness waiting until the observation window and horizon evidence are complete", () => {
    const evaluated = evaluateOperationalTwinTrajectoryQualityOutcome({
      spanMinutes: 30,
      overall: slice(30),
      horizons: [slice(10), slice(10), slice(10)],
      truthCoverage: 0.9,
    });
    expect(evaluated.decision).toBe("WAIT");
    expect(evaluated.reasons).toEqual(expect.arrayContaining([
      "process_window_insufficient",
      "paired_samples_insufficient",
      "horizon_samples_insufficient",
    ]));
  });

  it("uses PASS only for evidence readiness and FAIL for poor truth continuity", () => {
    expect(evaluateOperationalTwinTrajectoryQualityOutcome({
      spanMinutes: 180,
      overall: slice(90),
      horizons: [slice(30), slice(30), slice(30)],
      truthCoverage: 0.9,
    })).toEqual({ decision: "PASS", reasons: [], complete: true });

    expect(evaluateOperationalTwinTrajectoryQualityOutcome({
      spanMinutes: 180,
      overall: slice(90),
      horizons: [slice(30), slice(30), slice(30)],
      truthCoverage: 0.4,
    })).toEqual({ decision: "FAIL", reasons: ["truth_coverage_low"], complete: true });
  });

  it("bounds completed evidence to the 24-hour process-local window", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeValidator();
    validator.capture(situation(), baseNow);
    const at = baseNow + 5 * 60_000;
    const truth = localTruth(at, 27000);
    validator.observeTruth(new Map([[truth.icaoHex, truth]]), at + 1_000);

    const report = validator.report(new Date(baseNow + 25 * 60 * 60_000));
    expect(report.overall.pairedSamples).toBe(0);
    expect(report.created).toBe(0);
  });
});
