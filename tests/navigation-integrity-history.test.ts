import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn(() => null) }));

import { getPrisma } from "@/lib/server/db";
import { NavigationIntegrityService } from "@/lib/server/navigation-integrity";

type Row = Record<string, unknown> & { id: string; startedAt: string; endedAt: string | null };

function anomaly(id: number, startedAt: string, endedAt: string | null): Row {
  return {
    id: `ni-${id}`, startedAt, lastObservedAt: endedAt ?? startedAt, endedAt,
    cellKeysJson: "[]", altitudeBandsJson: "[]", affectedAircraftCount: 3, sampleCount: 4,
    baselineAircraftCount: 8, medianNic: null, medianNacP: null, medianNacV: null,
    baselineMedianNic: null, baselineMedianNacP: null, baselineMedianNacV: null,
    confidence: "LOW", severity: "WARNING", evidenceJson: "{}",
  };
}

class Query {
  private predicates: Array<(row: Row) => boolean>;
  private take = Number.MAX_SAFE_INTEGER;
  constructor(private readonly rows: Row[], predicates: Array<(row: Row) => boolean> = []) { this.predicates = predicates; }
  where(predicate: ((row: { startedAt: { lt: (date: unknown) => boolean }; endedAt: { gte: (date: unknown) => boolean } }) => boolean) | { endedAt: null }): Query {
    if (typeof predicate === "object") return new Query(this.rows, [...this.predicates, (row) => row.endedAt === predicate.endedAt]);
    return new Query(this.rows, [...this.predicates, (row) => predicate({
      startedAt: { lt: (date) => Date.parse(row.startedAt) < Date.parse(String(date)) },
      endedAt: { gte: (date) => row.endedAt !== null && Date.parse(row.endedAt) >= Date.parse(String(date)) },
    })]);
  }
  orderBy(): Query { return this; }
  limit(value: number): Query { const query = new Query(this.rows, this.predicates); query.take = value; return query; }
  async all(): Promise<Row[]> { return this.rows.filter((row) => this.predicates.every((predicate) => predicate(row))).slice(0, this.take); }
}

afterEach(() => vi.mocked(getPrisma).mockReturnValue(null));

describe("navigation integrity history query bounds", () => {
  it("filters both time bounds before the per-window limit and retains over 200 matches", async () => {
    const from = new Date("2026-10-20T00:00:00.000Z");
    const to = new Date("2026-10-21T00:00:00.000Z");
    const rows = [
      ...Array.from({ length: 210 }, (_, index) => anomaly(index, "2026-10-19T00:00:00.000Z", null)),
      ...Array.from({ length: 30 }, (_, index) => anomaly(index + 210, "2026-10-20T01:00:00.000Z", "2026-10-20T12:00:00.000Z")),
      ...Array.from({ length: 15 }, (_, index) => anomaly(index + 240, "2026-10-19T00:00:00.000Z", "2026-10-19T23:59:59.000Z")),
      anomaly(255, to.toISOString(), null),
    ];
    const table = new Query(rows);
    vi.mocked(getPrisma).mockReturnValue({
      orm: { public: { NavigationIntegrityAnomaly: table } },
    } as never);

    const history = await new NavigationIntegrityService().getHistory(from, to);
    expect(history.source).toBe("database");
    expect(history.complete).toBe(false);
    expect(history.anomalies).toHaveLength(231);
    expect(history.anomalies.filter((item) => item.endedAt === null)).toHaveLength(201);
    expect(history.anomalies.filter((item) => item.endedAt !== null)).toHaveLength(30);
    expect(history.anomalies.some((item) => item.endedAt !== null && Date.parse(item.endedAt) < from.getTime())).toBe(false);
    expect(history.anomalies.some((item) => Date.parse(item.startedAt) >= to.getTime())).toBe(false);
  });

  it("labels an in-memory fallback as incomplete when the database is unavailable", async () => {
    vi.mocked(getPrisma).mockReturnValue({} as never);
    const result = await new NavigationIntegrityService().getHistory(new Date("2026-10-20T00:00:00.000Z"), new Date("2026-10-21T00:00:00.000Z"));
    expect(result).toMatchObject({ source: "memory", complete: false });
  });
});
