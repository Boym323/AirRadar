import { describe, expect, it } from "vitest";
import type { AircraftView, TrailPoint } from "@/lib/aircraft/types";
import { detectSigmetTrajectoryDeviation } from "@/lib/weather/sigmet-trajectory-deviation";
import type { SigmetSnapshot } from "@/lib/weather/types";

function snapshot(): SigmetSnapshot {
  return {
    type: "FeatureCollection",
    fetchedAt: "2026-09-26T15:00:00.000Z",
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
        validFrom: "2026-09-26T14:00:00.000Z",
        validTo: "2026-09-26T18:00:00.000Z",
        lowerFt: 10_000,
        upperFt: 30_000,
        seriesId: "A1",
        rawText: "SIGMET A1 SEV TURB",
        source: "isigmet",
        fetchedAt: "2026-09-26T15:00:00.000Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[15.15, 49.8], [15.65, 49.8], [15.65, 50.2], [15.15, 50.2], [15.15, 49.8]]],
      },
    }],
  };
}

function aircraft(overrides: Partial<AircraftView> = {}): AircraftView {
  return {
    icaoHex: "abc123",
    callsign: "TEST123",
    registration: null,
    aircraftType: "A320",
    aircraftDescription: null,
    category: null,
    lat: 50,
    lon: 15,
    altitude: 20_000,
    baroAltitude: 20_000,
    geomAltitude: null,
    groundSpeed: 480,
    track: 20,
    verticalRate: 0,
    baroRate: 0,
    geomRate: null,
    squawk: null,
    emergency: null,
    seenSeconds: 0,
    seenPosSeconds: 0,
    messages: 1,
    rssi: null,
    source: "local",
    sourceType: null,
    origin: "local",
    distanceKm: null,
    bearing: null,
    lastSeen: "2026-09-26T15:00:00.000Z",
    onGround: false,
    provenance: undefined,
    enrichment: undefined,
    atc: undefined,
    ...overrides,
  } as AircraftView;
}

function point(recordedAt: string, track: number, overrides: Partial<TrailPoint> = {}): TrailPoint {
  return {
    lat: 50,
    lon: 15,
    recordedAt,
    altitude: 20_000,
    groundSpeed: 480,
    track,
    ...overrides,
  };
}

describe("SIGMET trajectory deviation", () => {
  it("detects a significant course change away from a previously projected SIGMET entry", () => {
    const result = detectSigmetTrajectoryDeviation(
      aircraft({ track: 20 }),
      [
        point("2026-09-26T14:55:00.000Z", 90),
        point("2026-09-26T14:59:30.000Z", 25),
      ],
      snapshot(),
    );

    expect(result).toMatchObject({
      sigmetId: "LKAA-A1",
      hazard: "SEV TURB",
      previousTrackDeg: 90,
      currentTrackDeg: 20,
      confidence: "medium",
    });
    expect(result?.headingChangeDeg).toBe(70);
    expect(result?.previousProjectedEntryMinutes).toBeGreaterThan(0);
  });

  it("does not infer an avoidance signal when a meaningful turn still projects into the same SIGMET", () => {
    expect(detectSigmetTrajectoryDeviation(
      aircraft({ track: 60 }),
      [point("2026-09-26T14:55:00.000Z", 90), point("2026-09-26T14:59:30.000Z", 62)],
      snapshot(),
    )).toBeNull();
  });

  it("does not emit a signal for a small heading change", () => {
    expect(detectSigmetTrajectoryDeviation(
      aircraft({ track: 78 }),
      [point("2026-09-26T14:55:00.000Z", 90), point("2026-09-26T14:59:30.000Z", 80)],
      snapshot(),
    )).toBeNull();
  });

  it("does not emit a signal for an on-ground target", () => {
    expect(detectSigmetTrajectoryDeviation(
      aircraft({ track: 20, onGround: true }),
      [point("2026-09-26T14:55:00.000Z", 90), point("2026-09-26T14:59:30.000Z", 25)],
      snapshot(),
    )).toBeNull();
  });

  it("respects SIGMET altitude limits for the earlier projected path", () => {
    expect(detectSigmetTrajectoryDeviation(
      aircraft({ track: 20, altitude: 35_000, baroAltitude: 35_000 }),
      [
        point("2026-09-26T14:55:00.000Z", 90, { altitude: 35_000 }),
        point("2026-09-26T14:59:30.000Z", 25, { altitude: 35_000 }),
      ],
      snapshot(),
    )).toBeNull();
  });
});
