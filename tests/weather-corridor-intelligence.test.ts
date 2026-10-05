import { describe, expect, it } from "vitest";
import type { OperationalTwinCorridor } from "@/lib/operational-twin/types";
import type { AircraftWindSnapshot } from "@/lib/weather/aircraft-wind-context";
import { buildWeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";
import type { PirepSnapshot, SigmetSnapshot } from "@/lib/weather/types";

const now = new Date("2026-10-05T06:00:00.000Z");

function corridor(): OperationalTwinCorridor {
  return {
    horizonMinutes: 30,
    stepMinutes: 10,
    mode: "ROUTE_AWARE",
    routeAdherence: "ON_ROUTE",
    routePrecision: "PRECISE",
    maxUncertaintyNm: 3,
    points: [
      { offsetMinutes: 0, at: "2026-10-05T06:00:00.000Z", lat: 50, lon: 14, altitudeFt: 10_000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
      { offsetMinutes: 10, at: "2026-10-05T06:10:00.000Z", lat: 50, lon: 15, altitudeFt: 10_000, trackDeg: 90, uncertaintyNm: 2, mode: "ROUTE_AWARE" },
      { offsetMinutes: 20, at: "2026-10-05T06:20:00.000Z", lat: 50, lon: 16, altitudeFt: 10_000, trackDeg: 90, uncertaintyNm: 2.5, mode: "ROUTE_AWARE" },
      { offsetMinutes: 30, at: "2026-10-05T06:30:00.000Z", lat: 50, lon: 17, altitudeFt: 10_000, trackDeg: 90, uncertaintyNm: 3, mode: "ROUTE_AWARE" },
    ],
    waypoints: [],
  };
}

function pireps(overrides: Partial<PirepSnapshot> = {}): PirepSnapshot {
  return {
    reports: [{
      id: "P1",
      reportType: "PIREP",
      urgent: false,
      observedAt: "2026-10-05T05:30:00.000Z",
      receivedAt: null,
      latitude: 50.05,
      longitude: 15.05,
      altitudeFt: 11_000,
      aircraftType: "B738",
      temperatureC: null,
      windDirectionDeg: null,
      windSpeedKt: null,
      turbulence: { intensity: "MOD", type: "CAT", frequency: "OCNL" },
      icing: null,
      weather: null,
      sky: null,
      visibilitySm: null,
      rawText: null,
    }],
    fetchedAt: now.toISOString(),
    stale: false,
    cacheSource: "live",
    snapshotAgeMs: 0,
    source: "Aviation Weather Center",
    query: { latitude: 50, longitude: 14, radiusNm: 300, hours: 6, altitudeFt: null },
    ...overrides,
  };
}

function sigmets(): SigmetSnapshot {
  return {
    type: "FeatureCollection",
    fetchedAt: now.toISOString(),
    stale: false,
    features: [{
      type: "Feature",
      id: "SIG1",
      properties: {
        id: "SIG1",
        issuingOffice: "LKAA",
        firId: "LKAA",
        firName: "PRAHA FIR",
        phenomenon: "TS",
        hazard: "THUNDERSTORM",
        qualifier: null,
        validFrom: "2026-10-05T05:45:00.000Z",
        validTo: "2026-10-05T07:00:00.000Z",
        lowerFt: 5_000,
        upperFt: 20_000,
        seriesId: "A1",
        rawText: null,
        source: "isigmet",
        fetchedAt: now.toISOString(),
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[15.5, 49.5], [16.5, 49.5], [16.5, 50.5], [15.5, 50.5], [15.5, 49.5]]],
      },
    }],
  };
}

function wind(): AircraftWindSnapshot {
  return {
    model: "ICON-EU",
    validAt: now.toISOString(),
    levelHpa: 700,
    stale: false,
    points: [
      { lat: 50, lon: 14, speedKt: 20, directionDeg: 90 },
      { lat: 50, lon: 15, speedKt: 30, directionDeg: 90 },
      { lat: 50, lon: 16, speedKt: 40, directionDeg: 90 },
      { lat: 50, lon: 17, speedKt: 50, directionDeg: 90 },
    ],
  };
}

describe("Weather Corridor Intelligence V1", () => {
  it("places PIREP turbulence on the nearest future corridor point", () => {
    const result = buildWeatherCorridorIntelligence({
      corridor: corridor(),
      pireps: pireps(),
      sigmets: null,
      windSnapshots: [],
      now,
    });
    const event = result.events.find((item) => item.type === "TURBULENCE");
    expect(event).toMatchObject({
      risk: "TURBULENCE",
      offsetMinutes: 10,
      severity: "MODERATE",
      confidence: "HIGH",
      source: "PIREP_AIREP",
    });
    expect(event?.distanceAlongCorridorNm).toBeGreaterThan(35);
    expect(event?.distanceAlongCorridorNm).toBeLessThan(42);
  });

  it("rejects PIREP evidence that is vertically irrelevant to the projected corridor", () => {
    const snapshot = pireps();
    snapshot.reports[0]!.altitudeFt = 30_000;
    const result = buildWeatherCorridorIntelligence({
      corridor: corridor(),
      pireps: snapshot,
      sigmets: null,
      windSnapshots: [],
      now,
    });
    expect(result.events.some((item) => item.source === "PIREP_AIREP")).toBe(false);
  });

  it("emits sampled SIGMET entry and exit with altitude-aware confidence", () => {
    const result = buildWeatherCorridorIntelligence({
      corridor: corridor(),
      pireps: null,
      sigmets: sigmets(),
      windSnapshots: [],
      now,
    });
    expect(result.events.filter((item) => item.source === "SIGMET").map((item) => item.type)).toEqual([
      "SIGMET_ENTRY",
      "SIGMET_EXIT",
    ]);
    expect(result.events.find((item) => item.type === "SIGMET_ENTRY")).toMatchObject({
      risk: "CONVECTION",
      offsetMinutes: 20,
      confidence: "HIGH",
      severity: "HIGH",
    });
    expect(result.events.find((item) => item.type === "SIGMET_EXIT")?.offsetMinutes).toBe(30);
  });

  it("does not emit an expired SIGMET intersection", () => {
    const snapshot = sigmets();
    snapshot.features[0]!.properties.validTo = "2026-10-05T06:05:00.000Z";
    const result = buildWeatherCorridorIntelligence({
      corridor: corridor(),
      pireps: null,
      sigmets: snapshot,
      windSnapshots: [],
      now,
    });
    expect(result.events).toEqual([]);
  });

  it("samples ICON-EU along the corridor and identifies increasing headwind", () => {
    const result = buildWeatherCorridorIntelligence({
      corridor: corridor(),
      pireps: null,
      sigmets: null,
      windSnapshots: [wind()],
      now,
    });
    expect(result.wind.status).toBe("AVAILABLE");
    expect(result.wind.samples).toHaveLength(4);
    expect(result.wind.trend).toBe("MORE_HEADWIND");
    expect(result.wind.deltaAlongTrackKt).toBeCloseTo(30, 1);
  });

  it("reports partial source coverage without inventing weather events", () => {
    const result = buildWeatherCorridorIntelligence({
      corridor: corridor(),
      pireps: null,
      sigmets: null,
      windSnapshots: [wind()],
      now,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.events).toEqual([]);
    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "ICON_EU", state: "AVAILABLE" }),
      expect.objectContaining({ source: "PIREP_AIREP", state: "UNAVAILABLE" }),
      expect.objectContaining({ source: "SIGMET", state: "UNAVAILABLE" }),
    ]));
  });
});
