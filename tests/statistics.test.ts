import { describe, expect, it, vi } from "vitest";
import { dayKey } from "@/lib/server/config";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { Aircraft, ReceiverPosition } from "@/lib/aircraft/types";
import { ReceiverStatistics } from "@/lib/server/statistics";
import type { ReceiverStatisticsPersistence, ReceiverStatisticsPersistenceSnapshot } from "@/lib/server/statistics";
import { coverageChartPoints, coveragePolygonPath, summarizeCoverage } from "@/lib/statistics-coverage";

const receiver: ReceiverPosition = { lat: 50, lon: 14, name: "Test" };
const fixtureClock = () => new Date("2026-09-08T12:00:00.000Z");

function aircraft(hex: string, lat = 50, lon = 14, options: { type?: string; airline?: string; bearing?: number; distanceKm?: number; registration?: string } = {}): Aircraft {
  const value = normalizeAircraft({ hex, flight: hex, lat, lon }, receiver, new Date("2026-09-08T12:00:00.000Z"));
  if (!value) throw new Error("aircraft could not be normalized");
  value.aircraftType = options.type ?? null;
  value.bearing = options.bearing ?? value.bearing;
  value.distanceKm = options.distanceKm ?? value.distanceKm;
  value.registration = options.registration ?? null;
  if (options.airline) {
    value.enrichment = {
      route: {
        callsign: hex,
        airline: options.airline,
        airlineIcao: null,
        airlineIata: null,
        origin: null,
        destination: null,
        originAirport: null,
        destinationAirport: null,
        source: "test",
        retrievedAt: new Date().toISOString(),
      },
    };
  }
  return value;
}

class FakePersistence implements ReceiverStatisticsPersistence {
  stored: ReceiverStatisticsPersistenceSnapshot | null = null;
  saves: ReceiverStatisticsPersistenceSnapshot[] = [];
  fail = false;
  async load(): Promise<ReceiverStatisticsPersistenceSnapshot | null> {
    return this.stored;
  }
  async save(snapshot: ReceiverStatisticsPersistenceSnapshot): Promise<void> {
    if (this.fail) throw new Error("database offline");
    this.saves.push(snapshot);
    this.stored = structuredClone(snapshot);
  }
}

describe("receiver statistics", () => {
  it("uses the Europe/Prague local date, including both DST transitions", () => {
    expect(dayKey(new Date("2026-03-28T22:59:59.000Z"), "Europe/Prague")).toBe("2026-03-28");
    expect(dayKey(new Date("2026-03-28T23:00:00.000Z"), "Europe/Prague")).toBe("2026-03-29");
    expect(dayKey(new Date("2026-03-29T00:30:00.000Z"), "Europe/Prague")).toBe("2026-03-29");
    expect(dayKey(new Date("2026-10-25T00:30:00.000Z"), "Europe/Prague")).toBe("2026-10-25");
    expect(dayKey(new Date("2026-10-25T01:30:00.000Z"), "Europe/Prague")).toBe("2026-10-25");
  });

  it("rolls daily RAM state at a local midnight", () => {
    let now = new Date("2026-09-08T21:59:00.000Z");
    const stats = new ReceiverStatistics({ timezone: "Europe/Prague", persistence: null, clock: () => now });
    stats.observe([aircraft("AAA001", 50, 14.1)], receiver, now);
    expect(stats.getResponse(1, null).daily.uniqueAircraft).toBe(1);
    now = new Date("2026-09-08T22:01:00.000Z");
    stats.observe([aircraft("BBB002", 50, 14.2)], receiver, now);
    expect(stats.getResponse(1, null)).toMatchObject({ date: "2026-09-09", daily: { uniqueAircraft: 1, maxConcurrentAircraft: 1 } });
  });

  it("counts an ICAO hex once per day and recovers it after restart", async () => {
    const persistence = new FakePersistence();
    const first = new ReceiverStatistics({ timezone: "Europe/Prague", persistence, flushIntervalMs: 1, clock: fixtureClock });
    const at = new Date("2026-09-08T12:00:00.000Z");
    first.observe([aircraft("AAA001")], receiver, at);
    first.observe([aircraft("AAA001")], receiver, new Date(at.getTime() + 2));
    await first.close();
    const restarted = new ReceiverStatistics({ timezone: "Europe/Prague", persistence, clock: fixtureClock });
    await restarted.load();
    expect(restarted.getResponse(0, null).daily.uniqueAircraft).toBe(1);
  });

  it("tracks maximum concurrency and maximum distance", () => {
    const stats = new ReceiverStatistics({ persistence: null, clock: fixtureClock });
    const at = new Date("2026-09-08T12:00:00.000Z");
    stats.observe([aircraft("AAA001", 50, 14, { distanceKm: 20 })], receiver, at);
    stats.observe([
      aircraft("AAA001", 50, 14, { distanceKm: 20 }),
      aircraft("BBB002", 50, 14, { distanceKm: 312.4 }),
    ], receiver, new Date(at.getTime() + 3_000));
    const response = stats.getResponse(2, 486);
    expect(response.daily).toMatchObject({ maxConcurrentAircraft: 2, maxDistanceKm: 312.4 });
    expect(response.live).toEqual({ aircraftCount: 2, messagesPerSecond: 486 });
    expect(stats.getDailyReceptionRecord()).toMatchObject({ distanceKm: 312.4, icaoHex: "BBB002", bearing: expect.any(Number), registration: null });
  });

  it("persists the best reception record with its bearing and registration", async () => {
    const persistence = new FakePersistence();
    const at = new Date("2026-09-08T12:00:00.000Z");
    const stats = new ReceiverStatistics({ persistence, flushIntervalMs: 1, clock: () => at });
    stats.observe([aircraft("ABC001", 50, 14, { distanceKm: 123.4, bearing: 271, registration: " OK-ABC " })], receiver, at);
    await stats.close();
    expect(persistence.saves[0]).toMatchObject({ maxDistanceKm: 123.4, maxDistanceIcaoHex: "ABC001", maxDistanceBearing: 271, maxDistanceRegistration: "OK-ABC" });

    const restarted = new ReceiverStatistics({ persistence, clock: () => at });
    await restarted.load();
    expect(restarted.getDailyReceptionRecord()).toMatchObject({ distanceKm: 123.4, icaoHex: "ABC001", bearing: 271, registration: "OK-ABC" });
  });

  it("puts north and the 359 degree edge in the expected buckets", () => {
    const stats = new ReceiverStatistics({ persistence: null, clock: fixtureClock });
    const at = new Date("2026-09-08T12:00:00.000Z");
    stats.observe([aircraft("ABC001", 51, 14, { bearing: 0, distanceKm: 100 })], receiver, at);
    stats.observe([aircraft("ABC002", 50, 14, { bearing: 359, distanceKm: 120 })], receiver, new Date(at.getTime() + 1_000));
    const coverage = stats.getResponse(1, null).coverage;
    expect(coverage[0]).toMatchObject({ bearingFrom: 0, bearingTo: 10, maxDistanceKm: 100 });
    expect(coverage[35]).toMatchObject({ bearingFrom: 350, bearingTo: 360, maxDistanceKm: 120 });
  });

  it("only increases coverage maxima", () => {
    const stats = new ReceiverStatistics({ persistence: null, clock: fixtureClock });
    const at = new Date("2026-09-08T12:00:00.000Z");
    stats.observe([aircraft("AAA001", 50, 14, { bearing: 120, distanceKm: 274 })], receiver, at);
    stats.observe([aircraft("AAA001", 50, 14, { bearing: 120, distanceKm: 12 })], receiver, new Date(at.getTime() + 1_000));
    expect(stats.getResponse(1, null).coverage[12]?.maxDistanceKm).toBe(274);
  });

  it("summarizes populated coverage buckets and returns the five best directions", () => {
    const result = summarizeCoverage([
      { bearingFrom: 0, bearingTo: 10, maxDistanceKm: 100 },
      { bearingFrom: 230, bearingTo: 240, maxDistanceKm: 448 },
      { bearingFrom: 240, bearingTo: 250, maxDistanceKm: 461 },
      { bearingFrom: 250, bearingTo: 260, maxDistanceKm: 442 },
      { bearingFrom: 10, bearingTo: 20, maxDistanceKm: 0 },
    ]);
    expect(result).toMatchObject({
      maxDistanceKm: 461,
      maxBearing: 244,
      populatedBuckets: 4,
      averageDistanceKm: 362.75,
    });
    expect(result.bestDirections.map((item) => item.bearingFrom)).toEqual([240, 230, 250, 0]);
    expect(summarizeCoverage([])).toMatchObject({ maxBearing: null, populatedBuckets: 0, averageDistanceKm: null, bestDirections: [] });
  });

  it("ignores invalid positions without excluding unique observation", () => {
    const stats = new ReceiverStatistics({ persistence: null, clock: fixtureClock });
    const invalidZero = aircraft("C0DE00", 0, 0, { distanceKm: 999 });
    const invalidNaN = aircraft("C0DE01", 50, 14, { distanceKm: Number.NaN, bearing: Number.NaN });
    invalidNaN.lat = Number.NaN;
    stats.observe([invalidZero, invalidNaN], receiver, new Date("2026-09-08T12:00:00.000Z"));
    const response = stats.getResponse(2, null);
    expect(response.daily.uniqueAircraft).toBe(2);
    expect(response.daily.maxDistanceKm).toBe(0);
    expect(response.coverage.every((bucket) => bucket.maxDistanceKm === 0)).toBe(true);
  });

  it("counts types and airlines once, then moves a late enrichment", () => {
    const stats = new ReceiverStatistics({ persistence: null, clock: fixtureClock });
    const at = new Date("2026-09-08T12:00:00.000Z");
    stats.observe([aircraft("AAA001", 50, 14, { type: "A320", airline: "Test Air" })], receiver, at);
    stats.observe([aircraft("AAA001", 50, 14, { type: "A320", airline: "Test Air" })], receiver, new Date(at.getTime() + 1_000));
    expect(stats.getResponse(1, null).topAircraftTypes).toEqual([{ name: "A320", count: 1 }]);
    expect(stats.getResponse(1, null).topAirlines).toEqual([{ name: "Test Air", count: 1 }]);
    stats.observe([aircraft("AAA001", 50, 14, { type: "B738", airline: "New Air" })], receiver, new Date(at.getTime() + 2_000));
    expect(stats.getResponse(1, null).topAircraftTypes).toEqual([{ name: "B738", count: 1 }]);
    expect(stats.getResponse(1, null).topAirlines).toEqual([{ name: "New Air", count: 1 }]);
  });

  it("coalesces persistence while a write is active", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const persistence = new FakePersistence();
    persistence.save = vi.fn(async (snapshot) => {
      persistence.saves.push(snapshot);
      if (persistence.saves.length === 1) await gate;
      persistence.stored = structuredClone(snapshot);
    });
    let now = new Date("2026-09-08T12:00:00.000Z");
    const stats = new ReceiverStatistics({ persistence, clock: () => now, flushIntervalMs: 1 });
    stats.observe([aircraft("AAA001")], receiver, now);
    now = new Date(now.getTime() + 2);
    stats.observe([aircraft("BBB002")], receiver, now);
    now = new Date(now.getTime() + 2);
    stats.observe([aircraft("CCC003")], receiver, now);
    expect(persistence.saves).toHaveLength(1);
    release();
    await stats.close();
    expect(persistence.saves).toHaveLength(2);
    expect(persistence.saves[1]?.uniqueAircraftCount).toBe(3);
  });

  it("keeps live state when persistence fails", async () => {
    const persistence = new FakePersistence();
    persistence.fail = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stats = new ReceiverStatistics({ persistence, flushIntervalMs: 1, clock: fixtureClock });
    stats.observe([aircraft("AAA001")], receiver, new Date("2026-09-08T12:00:00.000Z"));
    await stats.close();
    expect(stats.getResponse(1, 12).daily.uniqueAircraft).toBe(1);
    errorSpy.mockRestore();
  });

  it("returns an empty, safe DTO and no receiver coordinates", () => {
    const response = new ReceiverStatistics({ persistence: null }).getResponse(0, null);
    expect(response).toMatchObject({ daily: { uniqueAircraft: 0, maxConcurrentAircraft: 0, maxDistanceKm: 0 }, coverage: expect.any(Array) });
    expect(response.coverage).toHaveLength(36);
    expect(JSON.stringify(response)).not.toContain('"lat"');
    expect(JSON.stringify(response)).not.toContain('"lon"');
  });

  it("does not create a broken polar path for no data and keeps north at the top", () => {
    expect(coverageChartPoints([])).toEqual([]);
    expect(coveragePolygonPath([])).toBe("");
    const points = coverageChartPoints([{ bearingFrom: 0, bearingTo: 10, maxDistanceKm: 100 }]);
    expect(points).toHaveLength(36);
    expect(points[0]?.y).toBeLessThan(150);
    expect(coveragePolygonPath(points)).toMatch(/^M /);
  });
});
