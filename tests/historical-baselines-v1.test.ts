import { describe, expect, it } from "vitest";
import { buildHistoricalBaseline } from "@/lib/historical-baselines";

const trend = Array.from({ length: 10 }, (_, index) => ({
  date: "2026-09-" + String(index + 20).padStart(2, "0"),
  uniqueAircraft: 100 + index,
  maxConcurrentAircraft: 20 + index,
  maxDistanceKm: 180 + index,
}));

describe("Historical Baselines V1", () => {
  it("compares current values against the median of completed days", () => {
    const result = buildHistoricalBaseline({
      currentDate: "2026-10-07",
      current: { uniqueAircraft: 150, maxConcurrentAircraft: 25, maxDistanceKm: 185 },
      trend,
    });
    expect(result.uniqueAircraft.state).toBe("ABOVE");
    expect(result.maxConcurrentAircraft.state).toBe("NEAR");
    expect(result.uniqueAircraft.sampleDays).toBe(10);
  });

  it("excludes the current partial day from the completed-day baseline", () => {
    const result = buildHistoricalBaseline({
      currentDate: "2026-10-07",
      current: { uniqueAircraft: 1, maxConcurrentAircraft: 1, maxDistanceKm: 1 },
      trend: [...trend, { date: "2026-10-07", uniqueAircraft: 9999, maxConcurrentAircraft: 9999, maxDistanceKm: 9999 }],
    });
    expect(result.uniqueAircraft.baselineMedian).toBe(104.5);
    expect(result.uniqueAircraft.sampleDays).toBe(10);
  });

  it("fails closed when fewer than seven completed days exist", () => {
    const result = buildHistoricalBaseline({
      currentDate: "2026-10-07",
      current: { uniqueAircraft: 150, maxConcurrentAircraft: 25, maxDistanceKm: 185 },
      trend: trend.slice(0, 6),
    });
    expect(result.uniqueAircraft.state).toBe("INSUFFICIENT");
    expect(result.uniqueAircraft.deltaPercent).toBeNull();
  });
});
