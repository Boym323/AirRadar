import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  OperationalTwinEventOutcomeValidator,
  evaluateOperationalTwinWindTimingGraduation,
  type OperationalTwinSituation,
} from "@/lib/operational-twin";

const baseNow = Date.parse("2026-10-05T10:00:00.000Z");

function aircraft(at: number, lon: number): Aircraft {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: null,
    aircraftType: null,
    aircraftDescription: null,
    lat: 49,
    lon,
    altitude: 30000,
    baroAltitude: 30000,
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

function situation(
  shadowDeltaSeconds = -60,
  shadowStatus: "AVAILABLE" | "STALE" = "AVAILABLE",
): OperationalTwinSituation {
  const canonicalOffsetMinutes = 5;
  const shadowOffsetMinutes = canonicalOffsetMinutes + shadowDeltaSeconds / 60;
  const canonicalAt = new Date(baseNow + canonicalOffsetMinutes * 60_000).toISOString();
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
      waypoints: [{
        id: "VLM",
        name: "VLM",
        lat: 49,
        lon: 17.5,
        offsetMinutes: canonicalOffsetMinutes,
        at: canonicalAt,
        distanceNm: 35,
        sourceKind: "PUBLISHED_ATS",
      }],
    },
    weatherCorridor: {
      version: "weather-corridor-intelligence-v1",
      status: "AVAILABLE",
      horizonMinutes: 30,
      corridorMode: "ROUTE_AWARE",
      routePrecision: "PRECISE",
      events: [],
      wind: { status: shadowStatus === "STALE" ? "STALE" : "AVAILABLE", model: "ICON-EU", trend: "STABLE", deltaAlongTrackKt: 0, samples: [] },
      sources: [],
    },
    windTimingShadow: {
      version: "operational-digital-twin-wind-timing-shadow-v1",
      mode: "SHADOW",
      status: shadowStatus,
      reasons: [],
      windModel: "ICON-EU",
      windStatus: shadowStatus === "STALE" ? "STALE" : "AVAILABLE",
      corridorMode: "ROUTE_AWARE",
      observedGroundSpeedKt: 420,
      inferredStillAirSpeedKt: 400,
      windSamples: 3,
      uniqueWindSamples: 3,
      speedClampSegments: 0,
      checkpoints: [],
      waypoints: [{
        id: "VLM",
        name: "VLM",
        distanceNm: 35,
        canonicalOffsetMinutes,
        shadowOffsetMinutes,
        deltaSeconds: shadowDeltaSeconds,
        sourceKind: "PUBLISHED_ATS",
      }],
      maxAbsoluteDeltaSeconds: Math.abs(shadowDeltaSeconds),
      meanAbsoluteDeltaSeconds: Math.abs(shadowDeltaSeconds),
    },
    events: [{
      id: `waypoint:VLM:${canonicalAt}`,
      type: "WAYPOINT",
      offsetMinutes: canonicalOffsetMinutes,
      at: canonicalAt,
      title: "VLM",
      detail: "PUBLISHED_ATS · 35.0 NM",
      provenance: "PUBLISHED",
      confidence: "HIGH",
      source: "Route Intelligence V2",
      sourceReference: null,
      lat: 49,
      lon: 17.5,
      altitudeFt: null,
    }],
    evidence: { observed: 0, published: 1, planned: 0, predicted: 0, inferred: 0 },
    limitations: ["BOUNDED_PROJECTION", "SAMPLED_INTERSECTIONS"],
  };
}

describe("Digital Twin wind timing graduation V1", () => {
  it("pairs canonical and shadow timing against the exact same Event Outcome waypoint truth", () => {
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation(-60), { atcDataset: null, sigmets: null, destination: null });

    const observedAt = baseNow + 4 * 60_000 + 10_000;
    const truth = aircraft(observedAt, 17.5);
    validator.observeLocal(new Map([[truth.icaoHex, truth]]), observedAt + 1_000);

    const graduation = validator.report(new Date(observedAt + 1_000)).windTimingGraduation;
    expect(graduation.eligiblePredictions).toBe(1);
    expect(graduation.pairedSamples).toBe(1);
    expect(graduation.canonicalMeanAbsoluteTimingErrorSeconds).toBe(50);
    expect(graduation.shadowMeanAbsoluteTimingErrorSeconds).toBe(10);
    expect(graduation.meanImprovementSeconds).toBe(40);
    expect(graduation.shadowWins).toBe(1);
    expect(graduation.canonicalWins).toBe(0);
    expect(graduation.manualPromotionEligible).toBe(false);
    expect(graduation.canonicalTimingRemainsActive).toBe(true);
    expect(graduation.decision).toBe("WAIT");
  });

  it("does not admit stale wind timing into graduation evidence", () => {
    const validator = new OperationalTwinEventOutcomeValidator();
    validator.capture(situation(-60, "STALE"), { atcDataset: null, sigmets: null, destination: null });
    const report = validator.report(new Date(baseNow + 60_000));
    expect(report.windTimingGraduation.eligiblePredictions).toBe(0);
    expect(report.windTimingGraduation.pairedSamples).toBe(0);
  });

  it("waits while paired evidence is incomplete", () => {
    expect(evaluateOperationalTwinWindTimingGraduation({
      spanMinutes: 30,
      pairedSamples: 8,
      meaningfulAdjustments: 6,
      truthCoverage: 0.9,
      shadowWinRate: 0.8,
      relativeMaeImprovement: 0.25,
    })).toEqual({
      decision: "WAIT",
      reasons: expect.arrayContaining([
        "process_window_insufficient",
        "paired_samples_insufficient",
        "meaningful_adjustments_insufficient",
      ]),
      complete: false,
    });
  });

  it("fails when complete paired evidence demonstrates a material regression", () => {
    expect(evaluateOperationalTwinWindTimingGraduation({
      spanMinutes: 180,
      pairedSamples: 60,
      meaningfulAdjustments: 45,
      truthCoverage: 0.9,
      shadowWinRate: 0.4,
      relativeMaeImprovement: -0.08,
    })).toEqual({
      decision: "FAIL",
      reasons: ["shadow_regression"],
      complete: true,
    });
  });

  it("keeps canonical timing when the benefit is inconclusive", () => {
    expect(evaluateOperationalTwinWindTimingGraduation({
      spanMinutes: 180,
      pairedSamples: 60,
      meaningfulAdjustments: 45,
      truthCoverage: 0.9,
      shadowWinRate: 0.52,
      relativeMaeImprovement: 0.03,
    })).toEqual({
      decision: "WAIT",
      reasons: ["benefit_inconclusive"],
      complete: true,
    });
  });

  it("passes only after material paired improvement without enabling automatic promotion", () => {
    expect(evaluateOperationalTwinWindTimingGraduation({
      spanMinutes: 180,
      pairedSamples: 60,
      meaningfulAdjustments: 45,
      truthCoverage: 0.9,
      shadowWinRate: 0.65,
      relativeMaeImprovement: 0.12,
    })).toEqual({
      decision: "PASS",
      reasons: [],
      complete: true,
    });
  });
});
