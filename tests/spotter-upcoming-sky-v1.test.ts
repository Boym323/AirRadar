import { describe, expect, it } from "vitest";
import type { AircraftView, LogbookLabel } from "@/lib/aircraft/types";
import { rankUpcomingSky } from "@/lib/spotter-upcoming";

const observer = {
  lat: 50,
  lon: 14,
  altitudeMeters: 300,
  accuracyMeters: 5,
  capturedAt: "2026-10-07T13:00:00Z",
};

function aircraft(
  icaoHex: string,
  lon: number,
  track: number,
  type: string,
  speed = 240,
): AircraftView {
  return {
    icaoHex,
    callsign: icaoHex,
    registration: null,
    aircraftType: type,
    aircraftDescription: null,
    lat: 50,
    lon,
    altitude: 10000,
    baroAltitude: 10000,
    geomAltitude: null,
    groundSpeed: speed,
    track,
    verticalRate: 0,
    baroRate: 0,
    geomRate: null,
    squawk: "1000",
    category: null,
    emergency: null,
    rssi: null,
    messages: 1,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: "2026-10-07T13:00:00Z",
    source: "ADS-B",
    origin: "local",
    sourceType: null,
    onGround: false,
    distanceKm: null,
    bearing: null,
  };
}

describe("Spotter Upcoming Sky V1", () => {
  it("ranks a high-interest close pass ahead of routine traffic", () => {
    const labels = new Map<string, readonly LogbookLabel[]>([
      ["A38001", ["rare"]],
    ]);
    const ranked = rankUpcomingSky([
      aircraft("A38001", 13.98, 90, "A388"),
      aircraft("A32001", 13.97, 90, "A320"),
    ], observer, labels, null);

    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].aircraft.icaoHex).toBe("A38001");
    expect(ranked[0].interest.score).toBeGreaterThan(ranked.at(-1)!.interest.score);
  });

  it("drops departing and distant passes", () => {
    const ranked = rankUpcomingSky([
      aircraft("AWAY01", 14.02, 90, "A388"),
      { ...aircraft("FAR001", 13.2, 90, "A388", 100), lat: 50.1 },
    ], observer, new Map(), null, { maxClosestDistanceKm: 5 });
    expect(ranked).toEqual([]);
  });

  it("respects the bounded result limit", () => {
    const aircraftList = Array.from({ length: 12 }, (_, index) =>
      aircraft("A38" + String(index).padStart(3, "0"), 13.98 - index * 0.001, 90, "A388"));
    expect(rankUpcomingSky(aircraftList, observer, new Map(), null, { limit: 3 })).toHaveLength(3);
  });
});
