import { describe, expect, it } from "vitest";
import type { ReceiverStatisticsResponse } from "@/lib/aircraft/types";
import { statisticsCsv } from "@/lib/statistics-csv";

const statistics: ReceiverStatisticsResponse = {
  date: "2026-09-08",
  timezone: "Europe/Prague",
  live: { aircraftCount: 3, messagesPerSecond: 12.5 },
  daily: { uniqueAircraft: 12, maxConcurrentAircraft: 3, maxDistanceKm: 182.4 },
  coverage: [
    { bearingFrom: 0, bearingTo: 10, maxDistanceKm: 182.4 },
    { bearingFrom: 10, bearingTo: 20, maxDistanceKm: 0 },
  ],
  coverageSummary: { maxDistanceKm: 182.4, maxBearing: 0, populatedBuckets: 1, averageDistanceKm: 182.4, bestDirections: [] },
  topAircraftTypes: [],
  topAirlines: [],
};

describe("statistics CSV export", () => {
  it("exports bounded daily and coverage values while preserving missing data", () => {
    const csv = statisticsCsv(statistics);

    expect(csv).toContain("section,date,unique_aircraft,max_concurrent_aircraft,max_distance_km");
    expect(csv).toContain("daily,2026-09-08,12,3,182.4");
    expect(csv).toContain("coverage,2026-09-08,0,10,182.4");
    expect(csv).toContain("coverage,2026-09-08,10,20,");
    expect(csv.endsWith("\n")).toBe(true);
  });
});
