import { describe, expect, it } from "vitest";
import {
  aircraftOperationalFocusClearHref,
  aircraftOperationalFocusRadarHref,
  createAircraftOperationalFocusMapGeoJSON,
  resolveAircraftOperationalFocusMapTarget,
} from "@/lib/operational-twin/aircraft-operational-focus-ui";
import type { OperationalTwinSituation } from "@/lib/operational-twin";

function situation(): OperationalTwinSituation {
  return {
    version: "operational-digital-twin-v1",
    status: "available",
    generatedAt: "2026-10-06T08:00:00.000Z",
    aircraft: {
      icaoHex: "ABC123",
      callsign: "TEST123",
      registration: "OK-TST",
      observedAt: "2026-10-06T08:00:00.000Z",
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
      points: [
        { offsetMinutes: 0, at: "2026-10-06T08:00:00.000Z", lat: 49, lon: 17, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
        { offsetMinutes: 10, at: "2026-10-06T08:10:00.000Z", lat: 49, lon: 17.5, altitudeFt: 29000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" },
        { offsetMinutes: 20, at: "2026-10-06T08:20:00.000Z", lat: 49, lon: 18, altitudeFt: 25000, trackDeg: 90, uncertaintyNm: 4, mode: "ROUTE_AWARE" },
        { offsetMinutes: 30, at: "2026-10-06T08:30:00.000Z", lat: 49, lon: 18.5, altitudeFt: 18000, trackDeg: 90, uncertaintyNm: 6, mode: "ROUTE_AWARE" },
      ],
      waypoints: [],
    },
    weatherCorridor: {
      version: "weather-corridor-intelligence-v1",
      status: "AVAILABLE",
      horizonMinutes: 30,
      corridorMode: "ROUTE_AWARE",
      routePrecision: "PRECISE",
      events: [{
        id: "WX1",
        type: "SIGMET_ENTRY",
        risk: "CONVECTION",
        offsetMinutes: 12,
        at: "2026-10-06T08:12:00.000Z",
        distanceAlongCorridorNm: 25,
        lat: 49.2,
        lon: 17.7,
        altitudeFt: 28000,
        severity: "HIGH",
        confidence: "HIGH",
        source: "SIGMET",
        sourceReference: "SIG-1",
        evidence: ["test"],
      }],
      wind: {
        status: "UNAVAILABLE",
        model: null,
        trend: "UNAVAILABLE",
        deltaAlongTrackKt: null,
        samples: [],
      },
      sources: [],
    },
    navigationIntegrityCorridor: {
      version: "navigation-integrity-corridor-v1",
      status: "AVAILABLE",
      generatedAt: "2026-10-06T08:00:00.000Z",
      sourceGeneratedAt: "2026-10-06T08:00:00.000Z",
      sourceWindow: "15m",
      activeAnomalies: 1,
      intersections: 1,
      events: [{
        id: "NAV1",
        anomalyId: "A1",
        entryOffsetMinutes: 18,
        exitOffsetMinutes: 22,
        entryAt: "2026-10-06T08:18:00.000Z",
        exitAt: "2026-10-06T08:22:00.000Z",
        lat: 49.1,
        lon: 17.9,
        altitudeFt: 26000,
        altitudeBand: 5,
        cellKey: "cell",
        sampledPoints: 2,
        severity: "DEGRADED",
        confidence: "MEDIUM",
        affectedAircraftCount: 4,
        localAircraftCount: 3,
        networkAircraftCount: 1,
        baselineMaturity: "READY",
        auditCategories: [],
        source: "AIRRADAR_NAVIGATION_INTEGRITY",
        provenance: "INFERRED",
      }],
      limitations: ["SAMPLED_CENTERLINE", "REGIONAL_HEURISTIC", "CAUSE_UNKNOWN"],
    },
    operationalFocus: {
      version: "aircraft-operational-focus-v1",
      generatedAt: "2026-10-06T08:00:00.000Z",
      level: "ATTENTION",
      total: 3,
      watch: 1,
      attention: 2,
      truncated: false,
      items: [
        {
          id: "weather:WX1",
          type: "WEATHER",
          level: "ATTENTION",
          offsetMinutes: 12,
          at: "2026-10-06T08:12:00.000Z",
          confidence: "HIGH",
          label: "CONVECTION",
          source: "SIGMET",
          sourceReference: "SIG-1",
          reasonCodes: ["WEATHER_HIGH_SEVERITY"],
        },
        {
          id: "navigation-integrity:NAV1",
          type: "NAVIGATION_INTEGRITY",
          level: "ATTENTION",
          offsetMinutes: 18,
          at: "2026-10-06T08:18:00.000Z",
          confidence: "MEDIUM",
          label: "DEGRADED",
          source: "AIRRADAR_NAVIGATION_INTEGRITY",
          sourceReference: "A1",
          reasonCodes: ["NAVIGATION_INTEGRITY_DEGRADED"],
        },
        {
          id: "trajectory:TRJ1",
          type: "TRAJECTORY",
          level: "WATCH",
          offsetMinutes: 5,
          at: "2026-10-06T08:05:00.000Z",
          confidence: "HIGH",
          label: "DEVIATING",
          source: "prediction",
          sourceReference: null,
          reasonCodes: ["TRAJECTORY_NON_NORMAL"],
        },
      ],
      limitations: [
        "OPERATIONAL_CONTEXT_ONLY",
        "NOT_SAFETY_ALERT",
        "NO_ATC_CLEARANCE_INFERENCE",
        "SOURCE_SEMANTICS_PRESERVED",
        "NO_ALL_CLEAR_INFERENCE",
      ],
    },
    events: [{
      id: "TRJ1",
      type: "TRAJECTORY_STATE",
      offsetMinutes: 5,
      at: "2026-10-06T08:05:00.000Z",
      title: "DEVIATING",
      detail: null,
      provenance: "PREDICTED",
      confidence: "HIGH",
      source: "prediction",
      sourceReference: null,
      lat: null,
      lon: null,
      altitudeFt: 29500,
    }],
    evidence: { observed: 1, published: 0, planned: 0, predicted: 1, inferred: 2 },
    limitations: ["BOUNDED_PROJECTION"],
  };
}

describe("Aircraft Operational Focus map interaction V1", () => {
  it("builds a stable radar href with aircraft and focus identity", () => {
    expect(aircraftOperationalFocusRadarHref("abc123", "weather:WX1"))
      .toBe("/?aircraft=ABC123&operationalFocus=weather%3AWX1");
  });

  it("builds a stable clear-focus href that keeps the selected aircraft", () => {
    expect(aircraftOperationalFocusClearHref("abc123"))
      .toBe("/?aircraft=ABC123");
  });

  it("uses the source evidence coordinate for weather and navigation-integrity focus", () => {
    expect(resolveAircraftOperationalFocusMapTarget(situation(), "weather:WX1")).toMatchObject({
      lat: 49.2,
      lon: 17.7,
      level: "ATTENTION",
      type: "WEATHER",
    });
    expect(resolveAircraftOperationalFocusMapTarget(situation(), "navigation-integrity:NAV1")).toMatchObject({
      lat: 49.1,
      lon: 17.9,
      type: "NAVIGATION_INTEGRITY",
    });
  });

  it("falls back to the projected corridor when a source event has no coordinate", () => {
    const target = resolveAircraftOperationalFocusMapTarget(situation(), "trajectory:TRJ1");
    expect(target?.lat).toBeCloseTo(49);
    expect(target?.lon).toBeCloseTo(17.25);
  });

  it("builds a bounded corridor segment plus a target marker", () => {
    const geojson = createAircraftOperationalFocusMapGeoJSON(situation(), "weather:WX1");
    expect(geojson.features.map((feature) => feature.properties.kind)).toEqual(["corridor", "target"]);
    const line = geojson.features[0];
    expect(line?.geometry.type).toBe("LineString");
    if (line?.geometry.type === "LineString") {
      expect(line.geometry.coordinates.at(-1)?.[0]).toBeCloseTo(17.6);
      expect(line.geometry.coordinates.at(-1)?.[1]).toBeCloseTo(49);
    }
    const point = geojson.features[1];
    expect(point?.geometry).toEqual({ type: "Point", coordinates: [17.7, 49.2] });
  });

  it("fails closed for an unknown focus item", () => {
    expect(resolveAircraftOperationalFocusMapTarget(situation(), "weather:missing")).toBeNull();
    expect(createAircraftOperationalFocusMapGeoJSON(situation(), "weather:missing"))
      .toEqual({ type: "FeatureCollection", features: [] });
  });
});
