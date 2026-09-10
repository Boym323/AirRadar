import { describe, expect, it } from "vitest";
import {
  aggregateCoverageIntelligence,
  parseCoverageIntelligenceRange,
  type CoverageIntelligenceDailyCoverageRow,
} from "@/lib/statistics-coverage-intelligence";

const baseOptions = {
  range: "7d" as const,
  from: "2026-09-04",
  to: "2026-09-10",
  timezone: "Europe/Prague",
  generatedAt: "2026-09-10T20:00:00.000Z",
  statsRows: [],
  flightStartTimes: [],
  flightRowsComplete: true,
  highestFlight: null,
};

describe("coverage intelligence", () => {
  it("accepts only bounded historical ranges", () => {
    expect(parseCoverageIntelligenceRange("7d")).toBe("7d");
    expect(parseCoverageIntelligenceRange("30d")).toBe("30d");
    expect(parseCoverageIntelligenceRange("today")).toBeNull();
    expect(parseCoverageIntelligenceRange(null)).toBeNull();
  });

  it("computes daily-max percentiles and requires half the period for reliability", () => {
    const coverageRows: CoverageIntelligenceDailyCoverageRow[] = [100, 110, 120, 130, 140].map((distance, index) => ({
      date: `2026-09-${String(4 + index).padStart(2, "0")}`,
      azimuthBucket: 9,
      maxDistanceKm: distance,
    }));
    const result = aggregateCoverageIntelligence({ ...baseOptions, coverageRows });
    const east = result.coverage.sectors[9]!;

    expect(result.coverage.requiredReliableDays).toBe(4);
    expect(east.reliable).toBe(true);
    expect(east.observedDays).toBe(5);
    expect(east.coverageDaysPercent).toBe(71.4);
    expect(east.medianDailyMaxDistanceKm).toBe(120);
    expect(east.p95DailyMaxDistanceKm).toBe(140);
    expect(east.p99DailyMaxDistanceKm).toBe(140);
    expect(result.coverage.bestReliableP95).toEqual({ bearingFrom: 90, bearingTo: 100, distanceKm: 140 });
  });

  it("keeps sparse sectors visible but does not call them reliable", () => {
    const result = aggregateCoverageIntelligence({
      ...baseOptions,
      coverageRows: [
        { date: "2026-09-04", azimuthBucket: 1, maxDistanceKm: 200 },
        { date: "2026-09-05", azimuthBucket: 1, maxDistanceKm: 220 },
      ],
    });
    const sector = result.coverage.sectors[1]!;
    expect(sector.observedDays).toBe(2);
    expect(sector.reliable).toBe(false);
    expect(sector.p95DailyMaxDistanceKm).toBe(220);
    expect(result.coverage.bestReliableP95).toBeNull();
  });

  it("builds local-hour traffic bins and the busiest exact hour", () => {
    const result = aggregateCoverageIntelligence({
      ...baseOptions,
      coverageRows: [],
      flightStartTimes: [
        "2026-09-10T10:05:00.000Z",
        "2026-09-10T10:25:00.000Z",
        "2026-09-10T11:05:00.000Z",
        "2026-09-09T10:10:00.000Z",
      ],
    });

    expect(result.hourly.complete).toBe(true);
    expect(result.hourly.observedFlights).toBe(4);
    expect(result.hourly.bins[12]).toEqual({ hour: 12, count: 3 });
    expect(result.hourly.bins[13]).toEqual({ hour: 13, count: 1 });
    expect(result.hourly.busiestHour).toEqual({ localHour: "2026-09-10T12:00", count: 2 });
  });

  it("fails hourly ranking closed when the bounded Flight read is incomplete", () => {
    const result = aggregateCoverageIntelligence({
      ...baseOptions,
      coverageRows: [],
      flightStartTimes: ["2026-09-10T10:05:00.000Z"],
      flightRowsComplete: false,
    });
    expect(result.hourly.complete).toBe(false);
    expect(result.hourly.bins).toEqual([]);
    expect(result.hourly.busiestHour).toBeNull();
  });

  it("selects range records without position samples", () => {
    const highestFlight = {
      flightId: 77,
      icaoHex: "ABC123",
      callsign: "TEST77",
      registration: "OK-ABC",
      maxAltitudeFt: 39000,
      observedAt: "2026-09-10T12:00:00.000Z",
    };
    const result = aggregateCoverageIntelligence({
      ...baseOptions,
      coverageRows: [],
      highestFlight,
      statsRows: [
        {
          date: "2026-09-09",
          maxConcurrentAircraft: 72,
          maxDistanceKm: 310,
          maxDistanceIcaoHex: "AAAAAA",
          maxDistanceRegistration: "OK-AAA",
          maxDistanceBearing: 45,
          maxDistanceAt: "2026-09-09T12:00:00.000Z",
        },
        {
          date: "2026-09-10",
          maxConcurrentAircraft: 88,
          maxDistanceKm: 280,
          maxDistanceIcaoHex: "BBBBBB",
          maxDistanceRegistration: null,
          maxDistanceBearing: 90,
          maxDistanceAt: "2026-09-10T12:00:00.000Z",
        },
      ],
    });

    expect(result.records.peakConcurrent).toEqual({ date: "2026-09-10", count: 88 });
    expect(result.records.farthestReception?.distanceKm).toBe(310);
    expect(result.records.farthestReception?.icaoHex).toBe("AAAAAA");
    expect(result.records.highestFlight).toEqual(highestFlight);
  });
});
