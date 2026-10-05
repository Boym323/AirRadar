import { describe, expect, it } from "vitest";
import {
  createOperationalTwinMapGeoJSON,
  interpolateOperationalTwinPoint,
  OPERATIONAL_TWIN_MAP_MILESTONES_MINUTES,
} from "@/lib/operational-twin/map";
import type { OperationalTwinSituation } from "@/lib/operational-twin";

function situation(): OperationalTwinSituation {
  return {
    version: "operational-digital-twin-v1",
    status: "available",
    generatedAt: "2026-10-05T10:00:00.000Z",
    aircraft: {
      icaoHex: "ABC123",
      callsign: "TEST123",
      registration: "OK-TST",
      observedAt: "2026-10-05T10:00:00.000Z",
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
        { offsetMinutes: 0, at: "2026-10-05T10:00:00.000Z", lat: 49, lon: 17, altitudeFt: 30000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
        { offsetMinutes: 10, at: "2026-10-05T10:10:00.000Z", lat: 49, lon: 17.5, altitudeFt: 29000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" },
        { offsetMinutes: 20, at: "2026-10-05T10:20:00.000Z", lat: 49, lon: 18, altitudeFt: 25000, trackDeg: 90, uncertaintyNm: 4, mode: "ROUTE_AWARE" },
        { offsetMinutes: 30, at: "2026-10-05T10:30:00.000Z", lat: 49, lon: 18.5, altitudeFt: 18000, trackDeg: 90, uncertaintyNm: 6, mode: "ROUTE_AWARE" },
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
        id: "weather:1",
        type: "TURBULENCE",
        risk: "TURBULENCE",
        offsetMinutes: 20,
        at: "2026-10-05T10:20:00.000Z",
        distanceAlongCorridorNm: 40,
        lat: 49,
        lon: 18,
        altitudeFt: 25000,
        severity: "MODERATE",
        confidence: "MEDIUM",
        source: "PIREP_AIREP",
        sourceReference: "PIREP-1",
        evidence: ["test"],
      }],
      wind: {
        status: "AVAILABLE",
        model: "ICON-EU",
        trend: "STABLE",
        deltaAlongTrackKt: 0,
        samples: [],
      },
      sources: [],
    },
    events: [{
      id: "sector:1",
      type: "ATC_SECTOR_ENTRY",
      offsetMinutes: 10,
      at: "2026-10-05T10:10:00.000Z",
      title: "Praha ACC",
      detail: "TMA",
      provenance: "PREDICTED",
      confidence: "MEDIUM",
      source: "eAIP",
      sourceReference: null,
      lat: 49,
      lon: 17.5,
      altitudeFt: 29000,
    }],
    evidence: { observed: 1, published: 0, planned: 0, predicted: 1, inferred: 0 },
    limitations: ["BOUNDED_PROJECTION", "SAMPLED_INTERSECTIONS"],
  };
}

describe("Operational Digital Twin V2 map projection", () => {
  it("returns an empty collection without an available situation", () => {
    expect(createOperationalTwinMapGeoJSON(null)).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("creates the projected line, uncertainty envelope, time milestones and event markers", () => {
    const geojson = createOperationalTwinMapGeoJSON(situation());
    const kinds = geojson.features.map((feature) => feature.properties?.kind);
    expect(kinds).toContain("uncertainty");
    expect(kinds).toContain("corridor");
    expect(kinds.filter((kind) => kind === "milestone")).toHaveLength(OPERATIONAL_TWIN_MAP_MILESTONES_MINUTES.length);
    expect(kinds).toContain("event");
    expect(kinds).toContain("weather-event");

    const polygon = geojson.features.find((feature) => feature.properties?.kind === "uncertainty");
    expect(polygon?.geometry.type).toBe("Polygon");
    if (polygon?.geometry.type === "Polygon") {
      expect(polygon.geometry.coordinates[0]?.length).toBe(9);
    }
  });

  it("interpolates exact requested milestone positions between corridor samples", () => {
    const point = interpolateOperationalTwinPoint(situation().corridor.points, 5);
    expect(point).not.toBeNull();
    expect(point?.lat).toBeCloseTo(49);
    expect(point?.lon).toBeCloseTo(17.25);
    expect(point?.altitudeFt).toBeCloseTo(29500);
    expect(point?.uncertaintyNm).toBeCloseTo(1.5);
    expect(point?.at).toBe("2026-10-05T10:05:00.000Z");
  });
});
