import { afterEach, describe, expect, it, vi } from "vitest";
import "temporal-polyfill/full/global";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn(() => null) }));

import { getPrisma } from "@/lib/server/db";
import { AlertsFleetsRepository } from "@/lib/server/alerts-fleets-repository";

type DeliveryRow = Record<string, unknown> & {
  status: string;
  attemptCount: number;
  sentAt: string | null;
  updatedAt: string;
  lastError: string | null;
};

class DeliveryQuery {
  constructor(private readonly rows: DeliveryRow[], private readonly predicates: Array<(row: DeliveryRow) => boolean> = [], private readonly take = Number.MAX_SAFE_INTEGER) {}
  where(filter: Record<string, unknown> | ((row: { attemptCount: { gt: (value: number) => boolean } }) => boolean)): DeliveryQuery {
    const predicate = typeof filter === "function"
      ? (row: DeliveryRow) => filter({ attemptCount: { gt: (value) => row.attemptCount > value } })
      : (row: DeliveryRow) => Object.entries(filter).every(([key, value]) => row[key] === value);
    return new DeliveryQuery(this.rows, [...this.predicates, predicate], this.take);
  }
  private selected(): DeliveryRow[] { return this.rows.filter((row) => this.predicates.every((predicate) => predicate(row))); }
  groupBy(...fields: string[]) {
    return {
      aggregate: async (select: (aggregate: { count: () => unknown }) => Record<string, unknown>) => {
        const spec = select({ count: () => ({ operation: "count" }) });
        const groups = new Map<string, { row: DeliveryRow; count: number }>();
        for (const row of this.selected()) {
          const key = fields.map((field) => String(row[field])).join("\u0000");
          const value = groups.get(key);
          if (value) value.count += 1;
          else groups.set(key, { row, count: 1 });
        }
        return [...groups.values()].map(({ row, count }) => ({
          ...Object.fromEntries(fields.map((field) => [field, row[field]])),
          ...Object.fromEntries(Object.entries(spec).map(([alias]) => [alias, count])),
        }));
      },
    };
  }
  async aggregate(select: (aggregate: { count: () => unknown; sum: (field: string) => unknown; max: (field: string) => unknown }) => Record<string, unknown>) {
    const values = this.selected();
    const spec = select({
      count: () => ({ operation: "count" }),
      sum: (field) => ({ operation: "sum", field }),
      max: (field) => ({ operation: "max", field }),
    });
    return Object.fromEntries(Object.entries(spec).map(([alias, descriptor]) => {
      const operation = descriptor as { operation: string; field?: string };
      if (operation.operation === "count") return [alias, values.length];
      const picked = values.map((row) => row[operation.field!]).filter((value) => value !== null && value !== undefined);
      if (operation.operation === "sum") return [alias, picked.reduce<number>((sum, value) => sum + Number(value), 0)];
      return [alias, picked.sort((left, right) => Date.parse(String(right)) - Date.parse(String(left)))[0] ?? null];
    }));
  }
  orderBy(): DeliveryQuery {
    return new DeliveryQuery([...this.selected()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)), [], this.take);
  }
  limit(value: number): DeliveryQuery { return new DeliveryQuery(this.rows, this.predicates, value); }
  async first(): Promise<DeliveryRow | undefined> { return this.selected().slice(0, this.take)[0]; }
  async all(): Promise<DeliveryRow[]> { throw new Error("delivery health must not read all rows"); }
  async update(): Promise<DeliveryRow> { throw new Error("unused"); }
}

function referenceSnapshot(rows: DeliveryRow[]) {
  let queueDepth = 0, processing = 0, sent = 0, failed = 0, retryPending = 0, totalAttempts = 0;
  let lastSuccessAt: string | null = null, lastFailureAt: string | null = null, lastError: string | null = null;
  for (const row of rows) {
    totalAttempts += row.attemptCount;
    if (row.status === "PENDING") { queueDepth += 1; if (row.attemptCount > 0) retryPending += 1; }
    else if (row.status === "PROCESSING") processing += 1;
    else if (row.status === "SENT") {
      sent += 1;
      if (row.sentAt && (!lastSuccessAt || Date.parse(row.sentAt) > Date.parse(lastSuccessAt))) lastSuccessAt = row.sentAt;
    } else if (row.status === "FAILED") {
      failed += 1;
      if (!lastFailureAt || Date.parse(row.updatedAt) > Date.parse(lastFailureAt)) { lastFailureAt = row.updatedAt; lastError = row.lastError; }
    }
  }
  return { queueDepth, processing, sent, failed, retryPending, totalAttempts, terminalFailures: failed, lastSuccessAt, lastFailureAt, lastError };
}

afterEach(() => vi.mocked(getPrisma).mockReturnValue(null));

describe("bounded delivery-health aggregates", () => {
  it("matches the previous projection for empty and large mixed queues without loading full rows", async () => {
    const empty = new DeliveryQuery([]);
    vi.mocked(getPrisma).mockReturnValue({ orm: { public: { AlertDelivery: empty } } } as never);
    expect(await new AlertsFleetsRepository().deliveryHealthSnapshot()).toEqual(referenceSnapshot([]));

    const rows = Array.from({ length: 100_000 }, (_, index): DeliveryRow => ({
      status: "PENDING", attemptCount: index % 4 === 0 ? 1 : 0, sentAt: null,
      updatedAt: "2026-10-20T00:00:00.000Z", lastError: null,
    }));
    rows.push(
      ...Array.from({ length: 3 }, (_, index): DeliveryRow => ({ status: "PROCESSING", attemptCount: index, sentAt: null, updatedAt: "2026-10-20T01:00:00.000Z", lastError: null })),
      ...Array.from({ length: 5 }, (_, index): DeliveryRow => ({ status: "SENT", attemptCount: 2, sentAt: `2026-10-20T0${index}:00:00.000Z`, updatedAt: "2026-10-20T02:00:00.000Z", lastError: null })),
      ...Array.from({ length: 4 }, (_, index): DeliveryRow => ({ status: "FAILED", attemptCount: 5, sentAt: null, updatedAt: `2026-10-20T1${index}:00:00.000Z`, lastError: `failure-${index}` })),
      { status: "UNKNOWN", attemptCount: 9, sentAt: null, updatedAt: "2026-10-20T23:00:00.000Z", lastError: null },
    );
    vi.mocked(getPrisma).mockReturnValue({ orm: { public: { AlertDelivery: new DeliveryQuery(rows) } } } as never);
    expect(await new AlertsFleetsRepository().deliveryHealthSnapshot()).toEqual(referenceSnapshot(rows));
  });
});
