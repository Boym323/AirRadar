import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import {
  buildAircraftDestinationWindContext,
  buildAircraftWindAheadProfile,
  buildAircraftWindContext,
  windLevelForAltitude,
  type AircraftWindSnapshot,
} from "@/lib/weather/aircraft-wind-context";

function aircraft(track: number | null, overrides: Partial<AircraftView> = {}): AircraftView {
  return {
    lat: 50,
    lon: 15,
    track,
    altitude: 30_000,
    baroAltitude: 30_000,
    geomAltitude: null,
    ...overrides,
  } as AircraftView;
}

function wind(directionDeg: number, speedKt = 40, overrides: Partial<AircraftWindSnapshot> = {}): AircraftWindSnapshot {
  return {
    model: "ICON-EU",
    validAt: "2026-09-26T18:00:00.000Z",
    levelHpa: 300,
    stale: false,
    points: [{ lat: 50, lon: 15, speedKt, directionDeg }],
    ...overrides,
  };
}

describe("aircraft wind context", () => {
  it("selects the nearest supported pressure level to aircraft altitude", () => {
    expect(windLevelForAltitude(4_500)).toBe(850);
    expect(windLevelForAltitude(10_000)).toBe(700);
    expect(windLevelForAltitude(18_000)).toBe(500);
    expect(windLevelForAltitude(31_000)).toBe(300);
    expect(windLevelForAltitude(39_000)).toBe(200);
    expect(windLevelForAltitude(null)).toBeNull();
  });

  it("calculates pure headwind when wind comes from the aircraft track", () => {
    const result = buildAircraftWindContext(aircraft(90), wind(90, 50));
    expect(result).toMatchObject({
      headwindKt: 50,
      tailwindKt: 0,
      crosswindFrom: null,
    });
    expect(result?.crosswindKt).toBeCloseTo(0, 6);
  });

  it("calculates pure tailwind when wind comes from behind", () => {
    const result = buildAircraftWindContext(aircraft(90), wind(270, 50));
    expect(result?.tailwindKt).toBeCloseTo(50, 6);
    expect(result?.headwindKt).toBeCloseTo(0, 6);
    expect(result?.crosswindKt).toBeCloseTo(0, 6);
  });

  it("reports crosswind from the right and left relative to track", () => {
    const right = buildAircraftWindContext(aircraft(90), wind(180, 40));
    const left = buildAircraftWindContext(aircraft(90), wind(0, 40));

    expect(right?.crosswindKt).toBeCloseTo(40, 6);
    expect(right?.crosswindFrom).toBe("right");
    expect(left?.crosswindKt).toBeCloseTo(40, 6);
    expect(left?.crosswindFrom).toBe("left");
  });

  it("uses the nearest valid grid point and exposes its distance", () => {
    const result = buildAircraftWindContext(aircraft(90), wind(90, 20, {
      points: [
        { lat: 50.7, lon: 16, speedKt: 80, directionDeg: 180 },
        { lat: 50.05, lon: 15.05, speedKt: 20, directionDeg: 90 },
      ],
    }));
    expect(result?.windSpeedKt).toBe(20);
    expect(result?.sourceDistanceKm).toBeGreaterThan(0);
    expect(result?.sourceDistanceKm).toBeLessThan(10);
  });

  it("suppresses context outside the wind-grid proximity guard", () => {
    expect(buildAircraftWindContext(aircraft(90), wind(90, 20, {
      points: [{ lat: 52, lon: 18, speedKt: 20, directionDeg: 90 }],
    }))).toBeNull();
  });

  it("does not present upper-air wind as ground wind", () => {
    expect(buildAircraftWindContext(aircraft(90, { onGround: true }), wind(90))).toBeNull();
  });

  it("builds a 25/50/100 NM wind-ahead profile and detects increasing headwind", () => {
    const profile = buildAircraftWindAheadProfile(aircraft(90), wind(90, 20, {
      points: [
        { lat: 50, lon: 15, speedKt: 20, directionDeg: 90 },
        { lat: 50, lon: 15.65, speedKt: 30, directionDeg: 90 },
        { lat: 50, lon: 16.3, speedKt: 40, directionDeg: 90 },
        { lat: 50, lon: 17.6, speedKt: 55, directionDeg: 90 },
      ],
    }));

    expect(profile?.points.map((point) => point.distanceNm)).toEqual([25, 50, 100]);
    expect(profile?.points.map((point) => Math.round(point.headwindKt))).toEqual([30, 40, 55]);
    expect(profile?.trend).toBe("more_headwind");
    expect(profile?.deltaAlongTrackKt).toBeCloseTo(35, 6);
    expect(profile?.furthestDistanceNm).toBe(100);
  });

  it("detects increasing tailwind ahead", () => {
    const profile = buildAircraftWindAheadProfile(aircraft(90), wind(270, 20, {
      points: [
        { lat: 50, lon: 15, speedKt: 20, directionDeg: 270 },
        { lat: 50, lon: 15.65, speedKt: 30, directionDeg: 270 },
        { lat: 50, lon: 16.3, speedKt: 40, directionDeg: 270 },
        { lat: 50, lon: 17.6, speedKt: 50, directionDeg: 270 },
      ],
    }));
    expect(profile?.trend).toBe("more_tailwind");
    expect(profile?.deltaAlongTrackKt).toBeCloseTo(-30, 6);
  });

  it("labels mixed along-track changes as variable", () => {
    const profile = buildAircraftWindAheadProfile(aircraft(90), wind(90, 20, {
      points: [
        { lat: 50, lon: 15, speedKt: 20, directionDeg: 90 },
        { lat: 50, lon: 15.65, speedKt: 35, directionDeg: 90 },
        { lat: 50, lon: 16.3, speedKt: 25, directionDeg: 270 },
        { lat: 50, lon: 17.6, speedKt: 30, directionDeg: 90 },
      ],
    }));
    expect(profile?.trend).toBe("variable");
  });

  it("keeps small along-track changes stable and tolerates missing far samples", () => {
    const profile = buildAircraftWindAheadProfile(aircraft(90), wind(90, 20, {
      points: [
        { lat: 50, lon: 15, speedKt: 20, directionDeg: 90 },
        { lat: 50, lon: 15.65, speedKt: 23, directionDeg: 90 },
        { lat: 50, lon: 16.3, speedKt: 22, directionDeg: 90 },
      ],
    }));
    expect(profile?.trend).toBe("stable");
    expect(profile?.points.map((point) => point.distanceNm)).toEqual([25, 50, 100]);
  });

  it("suppresses the ahead profile on ground or without a usable current grid point", () => {
    expect(buildAircraftWindAheadProfile(aircraft(90, { onGround: true }), wind(90))).toBeNull();
    expect(buildAircraftWindAheadProfile(aircraft(90), wind(90, 20, {
      points: [{ lat: 52, lon: 18, speedKt: 20, directionDeg: 90 }],
    }))).toBeNull();
  });

  it("resolves wind against the direct bearing to destination", () => {
    const result = buildAircraftDestinationWindContext(
      aircraft(20),
      { lat: 50, lon: 16 },
      wind(90, 40),
    );
    expect(result?.bearingDeg).toBeCloseTo(89.6, 0);
    expect(result?.distanceNm).toBeGreaterThan(35);
    expect(result?.headwindKt).toBeGreaterThan(39);
    expect(result?.tailwindKt).toBeCloseTo(0, 6);
  });

  it("keeps destination wind independent from the current aircraft track", () => {
    const eastbound = buildAircraftDestinationWindContext(aircraft(90), { lat: 50, lon: 16 }, wind(90, 40));
    const northbound = buildAircraftDestinationWindContext(aircraft(0), { lat: 50, lon: 16 }, wind(90, 40));
    expect(eastbound?.headwindKt).toBeCloseTo(northbound?.headwindKt ?? 0, 6);
    expect(eastbound?.bearingDeg).toBeCloseTo(northbound?.bearingDeg ?? 0, 6);
  });

  it("suppresses destination wind without a valid airborne position or meaningful destination distance", () => {
    expect(buildAircraftDestinationWindContext(aircraft(90, { onGround: true }), { lat: 50, lon: 16 }, wind(90))).toBeNull();
    expect(buildAircraftDestinationWindContext(aircraft(90), { lat: 50, lon: 15 }, wind(90))).toBeNull();
    expect(buildAircraftDestinationWindContext(aircraft(90), null, wind(90))).toBeNull();
  });

  it("requires aircraft position, track and a valid wind vector", () => {
    expect(buildAircraftWindContext(aircraft(null), wind(90))).toBeNull();
    expect(buildAircraftWindContext(aircraft(90, { lat: null }), wind(90))).toBeNull();
    expect(buildAircraftWindContext(aircraft(90), wind(90, 40, {
      points: [{ lat: 50, lon: 15, speedKt: null, directionDeg: 90 }],
    }))).toBeNull();
  });
});
