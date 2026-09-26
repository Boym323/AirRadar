import { describe, expect, it } from "vitest";
import { percentile95 } from "@/lib/radar/performance-diagnostics";
// @ts-expect-error Runtime-only ESM benchmark budget.
import { RADAR_PERFORMANCE_SCENARIOS } from "../scripts/radar-performance-budget.mjs";

describe("radar 1600-aircraft performance audit", () => {
  it("covers current and headroom traffic densities", () => {
    expect(RADAR_PERFORMANCE_SCENARIOS.map((scenario: { aircraft: number }) => scenario.aircraft))
      .toEqual([50, 100, 250, 500, 1000, 1600, 2000, 3000, 5000]);
  });

  it("calculates p95 deterministically", () => {
    expect(percentile95([])).toBe(0);
    expect(percentile95([1])).toBe(1);
    expect(percentile95(Array.from({ length: 100 }, (_, index) => index + 1))).toBe(95);
  });
});
