import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  OperationalTwinTrajectoryQualityOutcomeV2Validator,
  evaluateOperationalTwinTrajectoryQualityOutcomeV2,
  type OperationalTwinSituation,
  type OperationalTwinTrajectoryQualityOutcomeV2Slice,
} from "@/lib/operational-twin";

const baseNow = Date.parse("2026-10-06T14:00:00.000Z");

function situation(): OperationalTwinSituation {
  const points = [
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
      points,
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
      points,
      checkpoints: [
        { offsetMinutes: 5, canonicalAltitudeFt: 26000, qualityAltitudeFt: 27000, altitudeDeltaFt: 1000 },
        { offsetMinutes: 15, canonicalAltitudeFt: 19000, qualityAltitudeFt: 22000, altitudeDeltaFt: 3000 },
        { offsetMinutes: 30, canonicalAltitudeFt: 10000, qualityAltitudeFt: 15000, altitudeDeltaFt: 5000 },
      ],
      canonicalRemainsActive: true,
      autoPromotion: false,
      limitations: ["SHADOW_ONLY", "NO_AIRCRAFT_PERFORMANCE_MODEL", "NO_ATC_CLEARANCE_INFERENCE", "HORIZONTAL_PATH_UNCHANGED", "NOT_FMS_INTENT"],
    },
    trajectoryQualityV3: {
      version: "operational-digital-twin-trajectory-quality-v3",
      status: "AVAILABLE",
      phase: "DESCENT",
      verticalProfile: "SELECTED_ALTITUDE_CAPTURE",
      performance: {
        performanceClass: "JET",
        size: "LARGE",
        maxVerticalRateFpm: 3200,
        fullRateMinutes: 4,
        taperEndMinutes: 15,
        source: "ICAO_DESCRIPTION",
      },
      selectedAltitude: {
        altitudeFt: 14000,
        source: "MCP/FCU",
        accepted: true,
        estimatedCaptureMinutes: 10,
        rejectionReason: null,
      },
      points,
      checkpoints: [
        { offsetMinutes: 5, canonicalAltitudeFt: 26000, v2AltitudeFt: 27000, v3AltitudeFt: 27500, deltaFromCanonicalFt: 1500, deltaFromV2Ft: 500 },
        { offsetMinutes: 15, canonicalAltitudeFt: 19000, v2AltitudeFt: 22000, v3AltitudeFt: 22500, deltaFromCanonicalFt: 3500, deltaFromV2Ft: 500 },
        { offsetMinutes: 30, canonicalAltitudeFt: 10000, v2AltitudeFt: 15000, v3AltitudeFt: 14500, deltaFromCanonicalFt: 4500, deltaFromV2Ft: -500 },
      ],
      canonicalRemainsActive: true,
      v2RemainsPromotionCandidate: true,
      autoPromotion: false,
      limitations: ["SHADOW_ONLY", "PERFORMANCE_ENVELOPE_HEURISTIC", "SELECTED_ALTITUDE_IS_NOT_CLEARANCE", "NO_DESTINATION_VERTICAL_PROFILE", "HORIZONTAL_PATH_UNCHANGED", "NOT_FMS_INTENT"],
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

function slice(pairedSamples: number): OperationalTwinTrajectoryQualityOutcomeV2Slice {
  return {
    pairedSamples,
    canonicalMeanAbsoluteErrorFt: 2000,
    v2MeanAbsoluteErrorFt: 1400,
    v3MeanAbsoluteErrorFt: 1000,
    v2RelativeMaeImprovementVsCanonical: 0.3,
    v3RelativeMaeImprovementVsCanonical: 0.5,
    v3RelativeMaeImprovementVsV2: 0.2857,
    v2WinsCanonical: 8,
    canonicalWinsV2: 2,
    v2CanonicalTies: 0,
    v2WinRateVsCanonical: 0.8,
    v3WinsCanonical: 9,
    canonicalWinsV3: 1,
    v3CanonicalTies: 0,
    v3WinRateVsCanonical: 0.9,
    v3WinsV2: 7,
    v2WinsV3: 3,
    v3V2Ties: 0,
    v3WinRateVsV2: 0.7,
    bestMeanAbsoluteErrorModel: "TRAJECTORY_QUALITY_V3",
  };
}

describe("Trajectory Quality Outcome Validation V2", () => {
  it("triple-pairs canonical, V2 and V3 against the same later LOCAL altitude truth", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeV2Validator();
    validator.capture(situation(), baseNow);

    for (const [minutes, altitude] of [[5, 27500], [15, 22500], [30, 14500]] as const) {
      const at = baseNow + minutes * 60_000;
      const truth = localTruth(at, altitude);
      validator.observeTruth(new Map([[truth.icaoHex, truth]]), at + 1_000);
    }

    const report = validator.report(new Date(baseNow + 31 * 60_000));
    expect(report.completed).toBe(3);
    expect(report.overall.pairedSamples).toBe(3);
    expect(report.overall.v3MeanAbsoluteErrorFt).toBe(0);
    expect(report.overall.v2MeanAbsoluteErrorFt).toBe(500);
    expect(report.overall.canonicalMeanAbsoluteErrorFt).toBe(3167);
    expect(report.overall.v3WinRateVsV2).toBe(1);
    expect(report.overall.v3WinRateVsCanonical).toBe(1);
    expect(report.overall.bestMeanAbsoluteErrorModel).toBe("TRAJECTORY_QUALITY_V3");
    expect(report.phases.DESCENT.pairedSamples).toBe(3);
    expect(report.performanceClasses.JET.pairedSamples).toBe(3);
    expect(report.v3Profiles.SELECTED_ALTITUDE_CAPTURE.pairedSamples).toBe(3);
    expect(report.comparisonModels).toEqual(["CANONICAL", "TRAJECTORY_QUALITY_V2", "TRAJECTORY_QUALITY_V3"]);
    expect(report.changesPromotionPolicy).toBe(false);
  });

  it("does not create partial samples when V3 is unavailable", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeV2Validator();
    const withoutV3 = { ...situation(), trajectoryQualityV3: undefined };
    validator.capture(withoutV3, baseNow);
    const report = validator.report(new Date(baseNow + 1_000));
    expect(report.created).toBe(0);
    expect(report.pending).toBe(0);
    expect(report.v3UnavailableCaptureSkips).toBe(1);
  });

  it("keeps evidence readiness separate from model superiority", () => {
    expect(evaluateOperationalTwinTrajectoryQualityOutcomeV2({
      spanMinutes: 180,
      overall: slice(90),
      horizons: [slice(30), slice(30), slice(30)],
      truthCoverage: 0.9,
    })).toEqual({ decision: "PASS", reasons: [], complete: true });

    expect(evaluateOperationalTwinTrajectoryQualityOutcomeV2({
      spanMinutes: 30,
      overall: slice(30),
      horizons: [slice(10), slice(10), slice(10)],
      truthCoverage: 0.9,
    }).decision).toBe("WAIT");
  });

  it("fails only readiness when mature truth coverage is poor", () => {
    expect(evaluateOperationalTwinTrajectoryQualityOutcomeV2({
      spanMinutes: 180,
      overall: slice(90),
      horizons: [slice(30), slice(30), slice(30)],
      truthCoverage: 0.4,
    })).toEqual({ decision: "FAIL", reasons: ["truth_coverage_low"], complete: true });
  });

  it("hydrates restart-stable V2 aggregate buckets without mixing V1 evidence", () => {
    const validator = new OperationalTwinTrajectoryQualityOutcomeV2Validator();
    validator.capture(situation(), baseNow);
    const at = baseNow + 5 * 60_000;
    const truth = localTruth(at, 27500);
    validator.observeTruth(new Map([[truth.icaoHex, truth]]), at + 1_000);

    const exported = validator.exportCalibrationBuckets(baseNow + 6 * 60_000);
    expect(exported).toHaveLength(1);

    const restarted = new OperationalTwinTrajectoryQualityOutcomeV2Validator();
    expect(restarted.hydrateCalibrationBuckets(exported, baseNow + 6 * 60_000)).toBe(1);
    const report = restarted.report(new Date(baseNow + 6 * 60_000));
    expect(report.completed).toBe(1);
    expect(report.overall.v3MeanAbsoluteErrorFt).toBe(0);
    expect(report.overall.v2MeanAbsoluteErrorFt).toBe(500);
    expect(report.window.restartStableAggregates).toBe(true);
  });
});
