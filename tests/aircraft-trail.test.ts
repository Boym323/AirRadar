import { describe, expect, it } from "vitest";
import type { TrailPoint } from "@/lib/aircraft/types";
import { boundTrailPoints, selectedTrail } from "@/lib/aircraft/trail";

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

  it("keeps only the recent bounded window and maximum point count", () => {
    const result = boundTrailPoints(
      [point(-21, 13.99), ...Array.from({ length: 130 }, (_, index) => point(-19 + index / 10, 14 + index / 1000))],
      now,
    );

    expect(result).toHaveLength(120);
    expect(result[0]?.lon).toBe(14.01);
    expect(result.every((item, index) => index === 0 || item.recordedAt >= result[index - 1]!.recordedAt)).toBe(true);
  });

  it("uses current-session points when history contributes nothing and clears on aircraft switch", () => {
    const live = new Map<string, TrailPoint[]>([["ABC123", [point(-1, 14.2)]]]);

    expect(selectedTrail(live, "ABC123", [], now)).toEqual(live.get("ABC123"));
    expect(selectedTrail(live, "DEF456", [], now)).toEqual([]);
  });
});
