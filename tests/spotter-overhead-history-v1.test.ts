import { describe, expect, it } from "vitest";
import { findRecentObserverPasses } from "@/lib/spotter-history";
import type { HistoricalAircraftTrack } from "@/lib/time-machine/playback";

const observer = {
  lat: 50,
  lon: 14,
  altitudeMeters: 300,
  accuracyMeters: 5,
  capturedAt: "2026-10-07T12:00:00Z",
};

function track(id: string, lon: number, timestamp: string, origin = "OMDB", destination = "LKPR"): HistoricalAircraftTrack {
  return {
    id,
    hex: id.slice(0, 6).toUpperCase(),
    callsign: id,
    registration: null,
    type: "A388",
    flightId: 1,
    origin,
    destination,
    positions: [
      { timestamp, lat: 50, lon, altitude: 9000, speed: 220, track: 90 },
      { timestamp: new Date(Date.parse(timestamp) + 30_000).toISOString(), lat: 50, lon: lon + 0.01, altitude: 8500, speed: 215, track: 90 },
    ],
  };
}

describe("Spotter Overhead History V1", () => {
  it("returns tracks whose historical positions passed within the observer radius", () => {
    const passes = findRecentObserverPasses([
      track("EK139A", 14.01, "2026-10-07T11:50:00Z"),
      track("FAR001", 14.5, "2026-10-07T11:55:00Z"),
    ], observer, 10);
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      callsign: "EK139A",
      aircraftType: "A388",
      origin: "OMDB",
      destination: "LKPR",
    });
    expect(passes[0].closestDistanceKm).toBeLessThan(1);
  });

  it("sorts recent passes newest first and applies a hard result limit", () => {
    const passes = findRecentObserverPasses([
      track("OLD001", 14.01, "2026-10-07T11:40:00Z"),
      track("NEW001", 14.01, "2026-10-07T11:58:00Z"),
    ], observer, 10, 1);
    expect(passes).toHaveLength(1);
    expect(passes[0].callsign).toBe("NEW001");
  });
});
