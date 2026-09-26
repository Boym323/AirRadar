import { describe, expect, it } from "vitest";
import { sigmetProximity, weatherAroundAircraft, weatherFreshness, windComponent } from "@/lib/weather/intelligence";

const now = new Date("2026-09-26T12:00:00.000Z");
const square = { type: "Polygon" as const, coordinates: [[[14.1, 49.9], [14.3, 49.9], [14.3, 50.1], [14.1, 50.1], [14.1, 49.9]]] };

describe("weather intelligence", () => {
  it("normalizes fresh, stale, and offline products", () => {
    expect(weatherFreshness("METAR", "2026-09-26T11:50:00.000Z", now, 900).state).toBe("FRESH");
    expect(weatherFreshness("RADAR", "2026-09-26T10:00:00.000Z", now, 900).state).toBe("STALE");
    expect(weatherFreshness("WIND", null, now).state).toBe("OFFLINE");
  });

  it("classifies headwind, tailwind, and crosswind components", () => {
    expect(windComponent(0, 180, 20).kind).toBe("HEADWIND");
    expect(windComponent(0, 0, 20).kind).toBe("TAILWIND");
    expect(windComponent(0, 90, 20).kind).toBe("CROSSWIND_RIGHT");
    expect(windComponent(null, 90, 20).kind).toBe("UNKNOWN");
  });

  it("reports SIGMET inside, approaching, and moving away geometrically", () => {
    expect(sigmetProximity(14.2, 50, { id: "S1", geometry: square, observedAt: now.toISOString() }, undefined, now)).toMatchObject({ inside: true, relation: "inside", distanceNm: 0 });
    expect(sigmetProximity(14.0, 50, { id: "S1", geometry: square, observedAt: now.toISOString() }, { longitude: 13.8, latitude: 50 }, now).relation).toBe("approaching");
    expect(sigmetProximity(14.0, 50, { id: "S1", geometry: square, observedAt: now.toISOString() }, { longitude: 14.2, latitude: 50 }, now).relation).toBe("moving_away");
  });

  it("builds a bounded around-aircraft summary and does not promote stale SIGMETs", () => {
    const result = weatherAroundAircraft({ longitude: 14, latitude: 50, track: 0, metars: [{ stationId: "LKPR", latitude: 50.1, longitude: 14.26, observationTime: now.toISOString(), observedAt: now.toISOString(), rawText: null, temperatureC: null, dewpointC: null, windDirectionDeg: 180, windVariable: false, windSpeedKt: 20, windGustKt: null, visibilityMeters: null, visibilityGreaterThan: true, altimeterHpa: null, flightCategory: "VFR" }], sigmets: [{ id: "S1", geometry: square, observedAt: "2026-09-26T10:00:00.000Z" }], wind: { fromDeg: 180, speedKt: 20, observedAt: now.toISOString() }, now });
    expect(result.nearestMetar?.stationId).toBe("LKPR");
    expect(result.wind.kind).toBe("HEADWIND");
    expect(result.sigmets[0]?.freshness.state).toBe("STALE");
  });
});
