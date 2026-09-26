import { describe, expect, it } from "vitest";
import {
  HISTORY_RETENTION_BATCH_SIZE,
  HISTORY_RETENTION_MAX_BATCHES,
  pruneHistoryRetention,
} from "@/lib/server/history";

type Position = { id: number; recordedAt: Date };

function millis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && value !== null && "epochMilliseconds" in value) {
    return Number((value as { epochMilliseconds: unknown }).epochMilliseconds);
  }
  return Number(value);
}

class PositionCollection {
  constructor(private readonly rows: Position[], private readonly root: Position[]) {}

  where(filter: (fields: {
    recordedAt: { lt(value: unknown): (row: Position) => boolean };
    id: { in(values: number[]): (row: Position) => boolean };
  }) => ((row: Position) => boolean)): PositionCollection {
    const predicates = {
      recordedAt: { lt: (value: unknown) => (row: Position) => row.recordedAt.getTime() < millis(value) },
      id: { in: (values: number[]) => (row: Position) => values.includes(row.id) },
    };
    const predicate = filter(predicates);
    return new PositionCollection(this.rows.filter(predicate), this.root);
  }

  orderBy(callback: (fields: { id: { asc(): string } }) => unknown): PositionCollection {
    callback({ id: { asc: () => "asc" } });
    return new PositionCollection([...this.rows].sort((a, b) => a.id - b.id), this.root);
  }

  limit(value: number): PositionCollection {
    return new PositionCollection(this.rows.slice(0, value), this.root);
  }

  select(): PositionCollection {
    return this;
  }

  async all(): Promise<Array<{ id: number }>> {
    return this.rows.map(({ id }) => ({ id }));
  }

  async deleteAndCount(): Promise<number> {
    const ids = new Set(this.rows.map((row) => row.id));
    const before = this.root.length;
    for (let index = this.root.length - 1; index >= 0; index -= 1) {
      if (ids.has(this.root[index]!.id)) this.root.splice(index, 1);
    }
    return before - this.root.length;
  }
}

function database(rows: Position[]) {
  return { orm: { public: { FlightPosition: new PositionCollection(rows, rows) } } };
}

describe("history retention v2", () => {
  it("deletes old positions in bounded batches and reports diagnostics", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const old = new Date("2026-01-01T00:00:00.000Z");
    const recent = new Date("2026-09-25T00:00:00.000Z");
    const batchSize = 5;
    const count = batchSize + 3;
    const rows: Position[] = [
      ...Array.from({ length: count }, (_, index) => ({ id: index + 1, recordedAt: old })),
      { id: count + 1, recordedAt: recent },
    ];

    const result = await pruneHistoryRetention(database(rows) as never, now, { batchSize, maxBatches: 4 });

    expect(result.rowsDeleted).toBe(count);
    expect(result.batches).toBe(2);
    expect(result.completed).toBe(true);
    expect(result.failureCount).toBe(0);
    expect(rows).toEqual([{ id: count + 1, recordedAt: recent }]);
  });

  it("bounds each maintenance run when the backlog is very large", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const old = new Date("2026-01-01T00:00:00.000Z");
    const batchSize = 5;
    const maxBatches = 3;
    const count = batchSize * (maxBatches + 1);
    const rows: Position[] = Array.from({ length: count }, (_, index) => ({ id: index + 1, recordedAt: old }));

    const result = await pruneHistoryRetention(database(rows) as never, now, { batchSize, maxBatches });

    expect(result.rowsDeleted).toBe(batchSize * maxBatches);
    expect(result.batches).toBe(maxBatches);
    expect(result.completed).toBe(false);
    expect(rows).toHaveLength(batchSize);
  });
});
