import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { aircraftSigmetContext, pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetSnapshot } from "@/lib/weather/types";

function aircraft(lat: number | null, lon: number | null, altitude: number | null): AircraftView {
  return {
    lat,
    lon,
    altitude,
    baroAltitude: altitude,
    geomAltitude: null,
  } as AircraftView;
}

function snapshot(overrides: Partial<SigmetSnapshot["features"][number]["properties"]> = {}): SigmetSnapshot {
  return {
    type: "FeatureCollection",
    fetchedAt: "2026-09-26T14:00:00.000Z",
    stale: false,
    features: [{
      type: "Feature",
      id: "LKAA-A1",
      properties: {
        id: "LKAA-A1",
        issuingOffice: "LKPR",
        firId: "LKAA",
        firName: "Prague FIR",
        phenomenon: "TURB",
        hazard: "SEV TURB",
        qualifier: "OBS",
        validFrom: "2026-09-26T13:00:00.000Z",
        validTo: "2026-09-26T17:00:00.000Z",
        lowerFt: 10_000,
        upperFt: 30_000,
        seriesId: "A1",
        rawText: "SIGMET A1 SEV TURB",
        source: "isigmet",
        fetchedAt: "2026-09-26T14:00:00.000Z",
        ...overrides,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[14, 49], [16, 49], [16, 51], [14, 51], [14, 49]]],
      },
    }],
  };
}

describe("aircraft SIGMET context", () => {
  it("matches an aircraft horizontally and vertically inside an active advisory", () => {
    expect(aircraftSigmetContext(aircraft(50, 15, 20_000), snapshot())).toEqual([
      expect.objectContaining({ id: "LKAA-A1", hazard: "SEV TURB", verticalMatch: "matched" }),
    ]);
  });

  it("suppresses advisories whose published altitude range does not include the aircraft", () => {
    expect(aircraftSigmetContext(aircraft(50, 15, 35_000), snapshot())).toEqual([]);
  });

  it("keeps horizontal matches when altitude relevance cannot be determined", () => {
    expect(aircraftSigmetContext(aircraft(50, 15, null), snapshot())).toEqual([
      expect.objectContaining({ id: "LKAA-A1", verticalMatch: "unknown" }),
    ]);
    expect(aircraftSigmetContext(aircraft(50, 15, 20_000), snapshot({ lowerFt: null, upperFt: null }))).toEqual([
      expect.objectContaining({ id: "LKAA-A1", verticalMatch: "unknown" }),
    ]);
  });

  it("rejects aircraft outside the advisory polygon", () => {
    expect(aircraftSigmetContext(aircraft(48, 15, 20_000), snapshot())).toEqual([]);
  });

  it("projects a near-term entry using current track and speed without claiming a route", () => {
    const advisory = snapshot();
    advisory.features[0]!.geometry = {
      type: "Polygon",
      coordinates: [[[15.2, 49.8], [15.6, 49.8], [15.6, 50.2], [15.2, 50.2], [15.2, 49.8]]],
    };
    const target = Object.assign(aircraft(50, 15, 20_000), {
      track: 90,
      groundSpeed: 600,
      verticalRate: 0,
      baroRate: 0,
      geomRate: null,
      onGround: false,
    });

    expect(aircraftSigmetContext(target, advisory)).toEqual([
      expect.objectContaining({
        id: "LKAA-A1",
        relation: "projected",
        estimatedMinutes: expect.any(Number),
        distanceNm: expect.any(Number),
        verticalMatch: "matched",
      }),
    ]);
  });

  it("does not project SIGMET entry for an on-ground or directionless target", () => {
    const advisory = snapshot();
    advisory.features[0]!.geometry = {
      type: "Polygon",
      coordinates: [[[15.2, 49.8], [15.6, 49.8], [15.6, 50.2], [15.2, 50.2], [15.2, 49.8]]],
    };
    const groundTarget = Object.assign(aircraft(50, 15, 20_000), { track: 90, groundSpeed: 600, onGround: true });
    const noTrack = Object.assign(aircraft(50, 15, 20_000), { track: null, groundSpeed: 600, onGround: false });
    expect(aircraftSigmetContext(groundTarget, advisory)).toEqual([]);
    expect(aircraftSigmetContext(noTrack, advisory)).toEqual([]);
  });

  it("treats polygon boundaries as inside", () => {
    expect(pointInSigmetGeometry(14, 50, snapshot().features[0]!.geometry)).toBe(true);
  });

  it("handles polygons crossing the international date line", () => {
    expect(pointInSigmetGeometry(179.5, 10.5, {
      type: "Polygon",
      coordinates: [[[179, 10], [-179, 10], [-179, 11], [179, 11], [179, 10]]],
    })).toBe(true);
    expect(pointInSigmetGeometry(-179.5, 10.5, {
      type: "Polygon",
      coordinates: [[[179, 10], [-179, 10], [-179, 11], [179, 11], [179, 10]]],
    })).toBe(true);
  });
});
