import { describe, expect, it } from "vitest";
import type { TrailPoint } from "@/lib/aircraft/types";
import { boundTrailPoints, selectedTrail, trailPointFromAircraft, appendTrailPoint } from "@/lib/aircraft/trail";

const now = Date.parse("2026-09-08T12:20:00.000Z");

function point(minutes: number, lon: number, lat = 50): TrailPoint {
  return {
    lat,
    lon,
    recordedAt: new Date(now + minutes * 60_000).toISOString(),
    altitude: 10_000,
    groundSpeed: 250,
    track: 90,
  };
}

describe("selected aircraft live trail", () => {
  it("timestamps coordinates at the position observation, not the last message", () => {
    const point = trailPointFromAircraft({
      lat: 50,
      lon: 14,
      lastSeen: "2026-09-08T12:00:10.000Z",
      seenSeconds: 0,
      seenPosSeconds: 8,
      altitude: 10_000,
      groundSpeed: 250,
      track: 90,
    });

    expect(point?.recordedAt).toBe("2026-09-08T12:00:02.000Z");
  });

  it("does not add untrusted or delayed position observations to the live tail", () => {
    const first = point(0, 14);
    const later = point(1, 14.01);
    expect(trailPointFromAircraft({ lat: 50, lon: 14, lastSeen: first.recordedAt, seenSeconds: 0, seenPosSeconds: null, altitude: null, groundSpeed: null, track: null })).toBeNull();
    expect(appendTrailPoint([later], first)).toEqual([later]);
  });

  it("accepts normal movement but rejects an implausible stale-source jump", () => {
    const first = point(0, 14);
    const normal = point(1, 14.01);
    const absurd = point(2, 20);
    expect(appendTrailPoint([first], normal)).toHaveLength(2);
    expect(appendTrailPoint([normal], absurd)).toEqual([normal]);
  });

  it("lets history expand the past without moving the live endpoint", () => {
    const live = new Map<string, TrailPoint[]>([["ABC123", [point(0, 14.2), point(1, 14.3)]]]);
    const history = [point(-2, 14), point(-1, 14.1)];
    const result = selectedTrail(live, "ABC123", history, now);
    expect(result.map((item) => item.lon)).toEqual([14, 14.1, 14.2, 14.3]);
    expect(result.at(-1)?.lon).toBe(14.3);
  });
  it("shows the selected aircraft trail and never mixes another ICAO identity", () => {
    const trails = new Map<string, TrailPoint[]>([
      ["ABC123", [point(-2, 14.01), point(-1, 14.02)]],
      ["DEF456", [point(-2, 15.01), point(-1, 15.02)]],
    ]);

    expect(selectedTrail(trails, "ABC123", [], now).map((item) => item.lon)).toEqual([14.01, 14.02]);
    expect(selectedTrail(trails, "DEF456", [], now).map((item) => item.lon)).toEqual([15.01, 15.02]);
    expect(selectedTrail(trails, null, [], now)).toEqual([]);
  });

  it("keeps points ordered by time and removes duplicate observations", () => {
    const repeated = point(-3, 14.03);
    const samePositionLater = point(-2.5, 14.03);
    const result = boundTrailPoints([point(-1, 14.02), repeated, samePositionLater, repeated, point(-2, 14.01)], now);

    expect(result.map((item) => item.recordedAt)).toEqual([
      samePositionLater.recordedAt,
      point(-2, 14.01).recordedAt,
      point(-1, 14.02).recordedAt,
    ]);
  });

  it("keeps the complete trail while the aircraft remains live", () => {
    const result = boundTrailPoints(
      [point(-21, 13.99), ...Array.from({ length: 130 }, (_, index) => point(-19 + index / 10, 14 + index / 1000))],
      now,
    );

    expect(result).toHaveLength(131);
    expect(result[0]?.lon).toBe(13.99);
    expect(result.every((item, index) => index === 0 || item.recordedAt >= result[index - 1]!.recordedAt)).toBe(true);
  });

  it("uses current-session points when history contributes nothing and clears on aircraft switch", () => {
    const live = new Map<string, TrailPoint[]>([["ABC123", [point(-1, 14.2)]]]);

    expect(selectedTrail(live, "ABC123", [], now)).toEqual(live.get("ABC123"));
    expect(selectedTrail(live, "DEF456", [], now)).toEqual([]);
  });
});
