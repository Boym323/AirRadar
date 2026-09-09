import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrisma } from "@/lib/server/db";
import {
  aggregateReceiverStatisticsRange,
  getReceiverStatisticsRange,
  loadReceiverStatisticsRangeRows,
  statisticsRangeBounds,
} from "@/lib/server/statistics-range";
import { getTranslations } from "@/lib/i18n";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));

type Row = Record<string, unknown>;

class FakeCollection {
  constructor(private readonly rows: Row[]) {}

  private fieldsFor(row: Row): Row {
    return new Proxy({}, {
      get: () => ({
        gte: (value: unknown) => String(row.date) >= String(value),
        lt: (value: unknown) => String(row.date) < String(value),
      }),
    });
  }

  where(filter: (fields: Row) => boolean): FakeCollection {
    return new FakeCollection(this.rows.filter((row) => filter(this.fieldsFor(row))));
  }

  async all(): Promise<Row[]> {
    return this.rows;
  }
}

function fakeDatabase(rows: { stats?: Row[]; aircraft?: Row[]; coverage?: Row[] }) {
  return {
    orm: {
      public: {
        ReceiverDailyStats: new FakeCollection(rows.stats ?? []),
        ReceiverDailyAircraft: new FakeCollection(rows.aircraft ?? []),
        ReceiverDailyCoverage: new FakeCollection(rows.coverage ?? []),
      },
    },
  };
}

const currentDay = {
  date: "2026-09-08",
  uniqueAircraftCount: 3,
  maxConcurrentAircraft: 3,
  maxDistanceKm: 200,
  aircraft: [
    { icaoHex: "CCC333", aircraftType: null, airline: null },
    { icaoHex: "AAA111", aircraftType: null, airline: null },
  ],
  coverage: [{ azimuthBucket: 2, maxDistanceKm: 70 }],
};

afterEach(() => vi.mocked(getPrisma).mockReset());

describe("receiver statistics ranges", () => {
  it("returns a seven-day local calendar range with missing days as null", () => {
    const result = aggregateReceiverStatisticsRange({
      range: "7d",
      now: new Date("2026-09-08T20:00:00.000Z"),
      timezone: "Europe/Prague",
      rows: {
        stats: [
          { date: "2026-09-02", uniqueAircraftCount: 1, maxConcurrentAircraft: 1, maxDistanceKm: 100 },
          { date: "2026-09-04", uniqueAircraftCount: 2, maxConcurrentAircraft: 2, maxDistanceKm: 180 },
          { date: "2026-09-08", uniqueAircraftCount: 2, maxConcurrentAircraft: 2, maxDistanceKm: 150 },
        ],
        aircraft: [
          { date: "2026-09-02", icaoHex: "AAA111", aircraftType: null, airline: null },
          { date: "2026-09-04", icaoHex: "AAA111", aircraftType: null, airline: null },
          { date: "2026-09-04", icaoHex: "BBB222", aircraftType: null, airline: null },
          { date: "2026-09-08", icaoHex: "CCC333", aircraftType: null, airline: null },
        ],
        coverage: [
          { date: "2026-09-02", azimuthBucket: 0, maxDistanceKm: 100 },
          { date: "2026-09-04", azimuthBucket: 0, maxDistanceKm: 120 },
          { date: "2026-09-04", azimuthBucket: 1, maxDistanceKm: 90 },
        ],
      },
      currentDay,
    });

    expect(result).toMatchObject({ range: "7d", days: 7, from: "2026-09-02", to: "2026-09-08", hasData: true });
    expect(result.summary).toEqual({ uniqueAircraft: 3, maxConcurrentAircraft: 3, maxDistanceKm: 200 });
    expect(result.trend).toHaveLength(7);
    expect(result.trend[0]).toMatchObject({ date: "2026-09-02", uniqueAircraft: 1 });
    expect(result.trend[1]).toEqual({ date: "2026-09-03", uniqueAircraft: null, maxConcurrentAircraft: null, maxDistanceKm: null });
    expect(result.coverage[0]?.maxDistanceKm).toBe(120);
    expect(result.coverage[1]?.maxDistanceKm).toBe(90);
    expect(result.coverage[2]?.maxDistanceKm).toBe(70);
    expect(result.coverageSummary).toMatchObject({
      maxDistanceKm: 120,
      maxBearing: 4,
      populatedBuckets: 3,
      averageDistanceKm: (120 + 90 + 70) / 3,
    });
    expect(result.coverageSummary.bestDirections.map((item) => item.bearingFrom)).toEqual([0, 10, 20]);
    expect(result.coverageTrend[1]?.maxDistanceKm).toBeNull();
    expect(result.coverageTrend[6]?.maxDistanceKm).toBe(70);
  });

  it("bounds the maximum range to 30 local days", () => {
    const bounds = statisticsRangeBounds("30d", new Date("2026-09-08T20:00:00.000Z"), "Europe/Prague");
    expect(bounds).toMatchObject({ from: "2026-08-10", to: "2026-09-08", toExclusive: "2026-09-09", days: 30 });
    const result = aggregateReceiverStatisticsRange({
      range: "30d",
      now: new Date("2026-09-08T20:00:00.000Z"),
      timezone: "Europe/Prague",
      rows: {
        stats: [
          { date: "2026-08-09", uniqueAircraftCount: 99, maxConcurrentAircraft: 99, maxDistanceKm: 999 },
          { date: "2026-08-10", uniqueAircraftCount: 4, maxConcurrentAircraft: 2, maxDistanceKm: 210 },
        ],
        aircraft: [{ date: "2026-08-10", icaoHex: "A00001", aircraftType: null, airline: null }],
        coverage: [],
      },
    });
    expect(result.trend).toHaveLength(30);
    expect(result.summary).toEqual({ uniqueAircraft: 1, maxConcurrentAircraft: 2, maxDistanceKm: 210 });
    expect(result.trend[0]?.date).toBe("2026-08-10");
  });

  it("uses Europe/Prague midnight boundaries and overlays the partial current day", async () => {
    expect(statisticsRangeBounds("7d", new Date("2026-09-07T21:59:00.000Z"), "Europe/Prague").to).toBe("2026-09-07");
    expect(statisticsRangeBounds("7d", new Date("2026-09-07T22:01:00.000Z"), "Europe/Prague").to).toBe("2026-09-08");

    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({
      stats: [{ date: "2026-09-08", uniqueAircraftCount: 2, maxConcurrentAircraft: 2, maxDistanceKm: 150 }],
      aircraft: [{ date: "2026-09-08", icaoHex: "AAA111", aircraftType: null, airline: null }],
      coverage: [{ date: "2026-09-08", azimuthBucket: 2, maxDistanceKm: 50 }],
    }) as never);
    const result = await getReceiverStatisticsRange({
      range: "7d",
      now: new Date("2026-09-08T20:00:00.000Z"),
      timezone: "Europe/Prague",
      currentDay,
    });
    expect(result.trend[6]).toMatchObject({ uniqueAircraft: 3, maxConcurrentAircraft: 3, maxDistanceKm: 200 });
    expect(result.summary.maxDistanceKm).toBe(200);
    expect(result.coverage[2]?.maxDistanceKm).toBe(70);
  });

  it("reads only bounded daily tables and aggregates their rows", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({
      stats: [
        { date: "2026-09-01", uniqueAircraftCount: 4, maxConcurrentAircraft: 2, maxDistanceKm: 100 },
        { date: "2026-09-02", uniqueAircraftCount: 5, maxConcurrentAircraft: 3, maxDistanceKm: 120 },
        { date: "2026-09-09", uniqueAircraftCount: 99, maxConcurrentAircraft: 99, maxDistanceKm: 999 },
      ],
      aircraft: [{ date: "2026-09-02", icaoHex: "AAA111", aircraftType: null, airline: null }],
      coverage: [{ date: "2026-09-02", azimuthBucket: 35, maxDistanceKm: 120 }],
    }) as never);
    const rows = await loadReceiverStatisticsRangeRows("2026-09-02", "2026-09-09");
    expect(rows.stats.map((row) => row.date)).toEqual(["2026-09-02"]);
    expect(rows.aircraft).toHaveLength(1);
    expect(rows.coverage).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("FlightPosition");
  });

  it("returns empty range data without confusing missing days with zero", async () => {
    vi.mocked(getPrisma).mockReturnValue(null);
    const result = await getReceiverStatisticsRange({
      range: "7d",
      now: new Date("2026-09-08T20:00:00.000Z"),
      timezone: "Europe/Prague",
    });
    expect(result.hasData).toBe(false);
    expect(result.summary).toEqual({ uniqueAircraft: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0 });
    expect(result.trend.every((point) => point.uniqueAircraft === null)).toBe(true);
    expect(result.coverage.every((bucket) => bucket.maxDistanceKm === 0)).toBe(true);
    expect(result.coverageSummary).toMatchObject({ maxBearing: null, populatedBuckets: 0, averageDistanceKm: null, bestDirections: [] });
    expect(result.comparison.current.uniqueAircraft).toBeNull();
    expect(result.comparison.previous.maxDistanceKm).toBeNull();
  });

  it("compares bounded current and previous local periods without percentages", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase({
      stats: [
        { date: "2026-09-08", uniqueAircraftCount: 2, maxConcurrentAircraft: 2, maxDistanceKm: 150 },
        { date: "2026-09-01", uniqueAircraftCount: 1, maxConcurrentAircraft: 1, maxDistanceKm: 80 },
      ],
      aircraft: [
        { date: "2026-09-08", icaoHex: "AAA111", aircraftType: null, airline: null },
        { date: "2026-09-08", icaoHex: "BBB222", aircraftType: null, airline: null },
        { date: "2026-09-01", icaoHex: "CCC333", aircraftType: null, airline: null },
      ],
      coverage: [
        { date: "2026-09-08", azimuthBucket: 0, maxDistanceKm: 150 },
        { date: "2026-09-01", azimuthBucket: 0, maxDistanceKm: 80 },
      ],
    }) as never);
    const result = await getReceiverStatisticsRange({ range: "7d", now: new Date("2026-09-08T20:00:00.000Z"), timezone: "Europe/Prague" });
    expect(result.comparison).toEqual({
      current: { from: "2026-09-02", to: "2026-09-08", hasData: true, uniqueAircraft: 2, maxConcurrentAircraft: 2, maxDistanceKm: 150, coverageMaxDistanceKm: 150 },
      previous: { from: "2026-08-26", to: "2026-09-01", hasData: true, uniqueAircraft: 1, maxConcurrentAircraft: 1, maxDistanceKm: 80, coverageMaxDistanceKm: 80 },
    });
  });

  it("provides translated range and tooltip copy in Czech and English", () => {
    expect(getTranslations("cs").statistics.rangeSevenDays).toBe("7 dní");
    expect(getTranslations("en").statistics.rangeSevenDays).toBe("7 days");
    expect(getTranslations("cs").statistics.trendHint).toContain("datum");
    expect(getTranslations("en").statistics.trendHint).toContain("date");
  });
});
