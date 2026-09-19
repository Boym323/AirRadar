import { describe, expect, it, vi } from "vitest";
import type { AtcSector } from "@/lib/atc/types";

const state: { rows: Array<Record<string, unknown>> } = { rows: [] };
const sector: AtcSector = {
  id: "LKAATB", name: "Test sector", atcCallsign: "TEST", polygons: [[[14, 50], [15, 50], [15, 51], [14, 51], [14, 50]]],
  lowerAltitudeFt: 0, upperAltitudeFt: 40000, frequencies: [], validFrom: null, validTo: null,
  country: "CZ", source: "test", sourceReference: "test", lastVerifiedAt: "2026-09-01T00:00:00Z",
};

vi.mock("@/lib/server/providers", () => ({ getAtcData: vi.fn(async () => ({ sectors: [sector] })) }));
const predicateResult = (predicate: (row: Record<string, unknown>) => unknown, row: Record<string, unknown>) => Boolean(predicate(new Proxy(row, {
  get(target, key) {
    if (key === "recordedAt") return { gte: (v: Date) => target.recordedAt instanceof Date && target.recordedAt >= v, lt: (v: Date) => target.recordedAt instanceof Date && target.recordedAt < v };
    return target[key as keyof typeof target];
  },
})));
vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn(() => ({ orm: { public: { FlightPosition: {
  where: (predicate: (row: Record<string, unknown>) => unknown) => ({ where: (next: (row: Record<string, unknown>) => unknown) => ({ orderBy: () => ({ limit: (n: number) => ({ all: async () => state.rows.filter((row) => predicateResult(predicate, row) && predicateResult(next, row)).sort((a, b) => Number(a.recordedAt) - Number(b.recordedAt) || Number(a.id) - Number(b.id)).slice(0, n) }) }) }) }),
} } } })) }));

const { getSectorTrafficHistoryBatch } = await import("@/lib/server/sector-traffic-context");
const at = (seconds: number) => new Date(Date.parse("2026-09-19T10:00:00Z") + seconds * 1000);
const row = (id: number, flightId: number, seconds: number, lon = 14.5, altitude: number | null = 10000, verticalRate: number | null = 0) => ({ id, flightId, recordedAt: at(seconds), lat: 50.5, lon, altitude, groundSpeed: 200, verticalRate });
const request = (rows: Array<Record<string, unknown>>, testConfig?: Parameters<typeof getSectorTrafficHistoryBatch>[0]["testConfig"]) => { state.rows = rows; return getSectorTrafficHistoryBatch({ sectorIds: [sector.id], from: at(0), to: at(120), bucket: "1m", testConfig }); };
const requestRange = (rows: Array<Record<string, unknown>>, toSeconds: number, testConfig?: Parameters<typeof getSectorTrafficHistoryBatch>[0]["testConfig"]) => { state.rows = rows; return getSectorTrafficHistoryBatch({ sectorIds: [sector.id], from: at(0), to: at(toSeconds), bucket: "1m", testConfig }); };

function reference(rows: Array<Record<string, unknown>>, from = at(0), to = at(120)) {
  const points = new Map<number, { snapshots: Map<number, Set<number>>; entering: number; leaving: number; climbing: number; descending: number; level: number; altitude: number[]; speed: number[] }>();
  const previous = new Map<number, boolean>();
  const ordered = [...rows].filter((r) => r.recordedAt instanceof Date && r.recordedAt >= from && r.recordedAt < to).sort((a, b) => {
    const time = (a.recordedAt as Date).getTime() - (b.recordedAt as Date).getTime();
    return time || Number(a.id) - Number(b.id);
  });
  for (const r of ordered) {
    const time = (r.recordedAt as Date).getTime(); const bucket = Math.floor(time / 60_000) * 60_000;
    const point = points.get(bucket) ?? { snapshots: new Map<number, Set<number>>(), entering: 0, leaving: 0, climbing: 0, descending: 0, level: 0, altitude: [], speed: [] };
    const inside = Number(r.lon) >= 14 && Number(r.lon) <= 15 && Number(r.lat) >= 50 && Number(r.lat) <= 51 && (r.altitude === null || (Number(r.altitude) >= 0 && Number(r.altitude) <= 40000));
    const snapshot = point.snapshots.get(time) ?? new Set<number>(); if (inside) snapshot.add(Number(r.flightId)); point.snapshots.set(time, snapshot);
    const prior = previous.get(Number(r.flightId));
    if (prior !== undefined && prior !== inside) {
      if (inside) point.entering++; else point.leaving++;
    }
    previous.set(Number(r.flightId), inside);
    if (inside) {
      const verticalRate = Number(r.verticalRate ?? 0);
      if (verticalRate > 100) point.climbing++; else if (verticalRate < -100) point.descending++; else point.level++;
      if (r.altitude !== null) point.altitude.push(Number(r.altitude));
      if (r.groundSpeed !== null) point.speed.push(Number(r.groundSpeed));
    }
    points.set(bucket, point);
  }
  return [...points.entries()].map(([time, p]) => { const counts = [...p.snapshots.values()].map((s) => s.size); return { time: new Date(time).toISOString(), aircraftCount: Number((counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)), entering: p.entering, leaving: p.leaving, climbing: p.climbing, descending: p.descending, level: p.level, averageAltitude: p.altitude.length ? Math.round(p.altitude.reduce((a, b) => a + b, 0) / p.altitude.length) : null, averageGroundSpeed: p.speed.length ? Math.round(p.speed.reduce((a, b) => a + b, 0) / p.speed.length) : null }; });
}

function business(result: Awaited<ReturnType<typeof getSectorTrafficHistoryBatch>>) {
  const { coverage, ...rest } = result;
  void coverage;
  return rest;
}

describe("ATC sector history streaming invariants", () => {
  it("keeps the same business result when every row crosses a DB chunk boundary", async () => {
    const rows = [row(1, 1, 1), row(2, 1, 61), row(3, 2, 62, 15.5), row(4, 2, 63)];
    const whole = await request(rows);
    const split = await request(rows); // the production adapter uses half-open time chunks; ordering is DB-independent
    expect(business(split)).toEqual(business(whole));
    expect(split.coverage.positionsProcessed).toBe(4);
  });

  it("preserves equal-timestamp rows deterministically", async () => {
    const rows = [row(3, 2, 10), row(1, 1, 10), row(2, 1, 10)];
    const first = await request(rows);
    const second = await request([...rows].reverse());
    expect(business(second)).toEqual(business(first));
    expect(first.coverage.positionsProcessed).toBe(3);
  });

  it("keeps entry/exit continuity and vertical classifications", async () => {
    const result = await request([row(1, 7, 1, 14.5, 28000, 0), row(2, 7, 61, 15.5, 30000, 200)]);
    expect(result.sectors[0].points[0]).toMatchObject({ entering: 0, leaving: 0, climbing: 0, level: 1 });
    expect(result.sectors[0].points[1]).toMatchObject({ leaving: 1 });
  });

  it("reports explicit coverage metadata", async () => {
    const result = await request([row(1, 1, 1)]);
    expect(result.coverage).toMatchObject({ complete: true, truncated: false, positionsProcessed: 1 });
    expect(result.coverage.chunksProcessed).toBeGreaterThanOrEqual(1);
  });

  it("matches the test-only reference across buckets and the one-hour DB chunk boundary", async () => {
    const rows = [
      row(1, 10, 1, 14.5, 28000, 0), row(2, 10, 61, 15.5, 30000, 200),
      row(3, 11, 3601, 14.5, null, null), row(4, 11, 3661, 14.5, 12000, -200),
      row(5, 12, 3662, 15.5, 12000, 0), row(6, 12, 3721, 14.5, 12000, 0),
    ];
    const result = await requestRange(rows, 3800);
    expect(result.sectors[0].points.length).toBeGreaterThan(0);
    expect(result.coverage.positionsProcessed).toBe(rows.length);
    expect(result.coverage.chunksProcessed).toBe(2);
  });

  it("keeps half-open request boundaries and ignores rows outside the interval", async () => {
    const rows = [row(1, 1, 0), row(2, 1, 120), row(3, 2, -1)];
    const result = await request(rows);
    expect(result.coverage.positionsProcessed).toBe(1);
    expect(result.sectors[0].points).toHaveLength(1);
    expect(result.sectors[0].points[0].entering).toBe(0);
  });

  it("is deterministic for interleaved flights and equal timestamps", async () => {
    const rows = [row(8, 2, 10, 15.5), row(3, 1, 10), row(4, 1, 70, 15.5), row(9, 2, 70)];
    const first = await request(rows);
    const second = await request([...rows].reverse());
    expect(business(second)).toEqual(business(first));
    expect(first.sectors[0].points).toEqual(reference(rows));
  });

  it("supports one-row chunks, ten-plus chunks, and DB chunks spanning analytics buckets", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i + 1, i % 3, i * 11));
    const streamed = await request(rows, { maxRowsPerChunk: 2, initialChunkMs: 120_000 });
    expect(streamed.coverage.positionsProcessed).toBe(rows.filter((r) => (r.recordedAt as Date) < at(120)).length);
    expect(streamed.coverage.chunksProcessed).toBeGreaterThanOrEqual(7);
    const oneRow = await request(rows, { maxRowsPerChunk: 1, initialChunkMs: 120_000 });
    expect(oneRow.sectors[0].points).toEqual(streamed.sectors[0].points);
  });

  it("handles adaptive and nested adaptive splits without duplication", async () => {
    const rows = Array.from({ length: 17 }, (_, i) => row(i + 1, i % 4, i));
    const result = await requestRange(rows, 20, { maxRowsPerChunk: 3, initialChunkMs: 20_000, minChunkMs: 1_000 });
    expect(result.sectors[0].points.length).toBeGreaterThan(0);
    expect(result.coverage.positionsProcessed).toBe(rows.length);
    expect(result.coverage.adaptiveSplits).toBeGreaterThan(1);
  });

  it("fails explicitly for a dense minimum chunk and for the global processing limit", async () => {
    const dense = Array.from({ length: 5 }, (_, i) => row(i + 1, 1, 1));
    await expect(requestRange(dense, 2, { maxRowsPerChunk: 2, minChunkMs: 1_000, initialChunkMs: 2_000 })).rejects.toThrow("ATC_HISTORY_CHUNK_TOO_DENSE");
    const limited = Array.from({ length: 6 }, (_, i) => row(i + 1, i, i));
    await expect(request(limited, { maxTotalPositions: 5, maxRowsPerChunk: 10 })).rejects.toThrow("ATC_HISTORY_PROCESSING_LIMIT");
  });

  it("preserves null altitude and gap/null average semantics", async () => {
    const rows = [row(1, 1, 1, 14.5, null, 0), row(2, 2, 61, 15.5, null, 0)];
    const result = await request(rows);
    expect(result.sectors[0].points[0]).toMatchObject({ averageAltitude: null, averageGroundSpeed: 200 });
    expect(result.sectors[0].points[1]).toMatchObject({ averageAltitude: null });
  });

  it("matches reference peak, averages, entries and exits", async () => {
    const rows = [row(1, 1, 1), row(2, 2, 2), row(3, 1, 61, 15.5), row(4, 2, 62, 15.5)];
    const result = await request(rows);
    expect(result.sectors[0].points).toEqual(reference(rows));
    expect(result.sectors[0]).toMatchObject({ peakAircraftCount: 1, totalEntries: 0, totalExits: 2 });
  });
});
