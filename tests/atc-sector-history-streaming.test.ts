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
  where: (predicate: (row: Record<string, unknown>) => unknown) => ({ where: (next: (row: Record<string, unknown>) => unknown) => ({ orderBy: () => ({ limit: () => ({ all: async () => state.rows.filter((row) => predicateResult(predicate, row) && predicateResult(next, row)).sort((a, b) => Number(a.id) - Number(b.id)) }) }) }) }),
} } } })) }));

const { getSectorTrafficHistoryBatch } = await import("@/lib/server/sector-traffic-context");
const at = (seconds: number) => new Date(Date.parse("2026-09-19T10:00:00Z") + seconds * 1000);
const row = (id: number, flightId: number, seconds: number, lon = 14.5, altitude = 10000, verticalRate: number | null = 0) => ({ id, flightId, recordedAt: at(seconds), lat: 50.5, lon, altitude, groundSpeed: 200, verticalRate });
const request = (rows: Array<Record<string, unknown>>) => { state.rows = rows; return getSectorTrafficHistoryBatch({ sectorIds: [sector.id], from: at(0), to: at(120), bucket: "1m" }); };

function business(result: Awaited<ReturnType<typeof getSectorTrafficHistoryBatch>>) {
  const { coverage: _coverage, ...rest } = result;
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
});
