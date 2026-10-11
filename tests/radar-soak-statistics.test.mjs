import { describe, expect, it } from "vitest";
import {
  nearestRank, summarizeDistribution, parseLinuxCpuTicks, cpuPercent,
} from "../scripts/radar-soak-statistics.mjs";

describe("Radar Soak distribution metrics", () => {
  it("uses bounded nearest-rank P50/P95/P99 without interpolating", () => {
    const input = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(nearestRank(input, 0.5)).toBe(50);
    expect(nearestRank(input, 0.95)).toBe(95);
    expect(nearestRank(input, 0.99)).toBe(99);
    expect(() => nearestRank([1], 0)).toThrow(RangeError);
    expect(summarizeDistribution([0, 20, 30, NaN, -2])).toEqual({
      sampleCount: 3, mean: 50 / 3, p50: 20, p95: 30, p99: 30, max: 30,
    });
    expect(summarizeDistribution([]).p99).toBeNull();
  });
  it("parses stat fields despite parentheses in process name", () => {
    const parts = ["S", ...Array(10).fill("0"), "100", "40", ...Array(7).fill("0")];
    expect(parseLinuxCpuTicks(`123 (next (app)) ${parts.join(" ")}`)).toBe(140);
    expect(parseLinuxCpuTicks("bad data")).toBeNull();
    expect(cpuPercent({ ticks: 100, atMs: 0 }, { ticks: 200, atMs: 1000 }, 100)).toBe(100);
    expect(cpuPercent({ ticks: 100, atMs: 0 }, { ticks: 200, atMs: 0 }, 100)).toBeNull();
  });
});
