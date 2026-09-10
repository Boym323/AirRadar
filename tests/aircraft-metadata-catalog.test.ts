import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { BoundedTtlLruCache, METADATA_IMPORT_BATCH_SIZE, parseAircraftMetadataCsv } from "@/lib/server/aircraft-metadata-catalog";
import { AircraftMetadataCatalog } from "@/lib/server/aircraft-metadata-catalog";

describe("aircraft metadata catalog memory bounds", () => {
  it("evicts least-recently-used records and expires them", () => {
    const cache = new BoundedTtlLruCache<string | null>(2, 100);
    cache.set("one", "1", 0);
    cache.set("two", "2", 0);
    expect(cache.get("one", 1)).toBe("1");
    cache.set("three", "3", 1);
    expect(cache.get("two", 1)).toBeUndefined();
    expect(cache.size).toBe(2);
    expect(cache.get("one", 101)).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it("evicts by weight as well as entry count", () => {
    const cache = new BoundedTtlLruCache<string>(10, 100, 5, (value) => value.length);
    cache.set("one", "1234", 0);
    cache.set("two", "123", 0);
    expect(cache.get("one", 1)).toBeUndefined();
    expect(cache.get("two", 1)).toBe("123");
    expect(cache.weightBytes).toBe(3);
  });

  it("keeps CSV parsing compatible while exposing a bounded import batch", () => {
    const records = parseAircraftMetadataCsv(
      "hex;registration;type;flags;description;year;operator\nabc123;OK-TEST;A320;1;Airbus;2020;Example",
      "test://catalog",
      "dataset-1",
    );
    expect(records).toMatchObject([{ icaoHex: "ABC123", registration: "OK-TEST", sourceReference: "test://catalog", datasetVersion: "dataset-1" }]);
    expect(METADATA_IMPORT_BATCH_SIZE).toBeGreaterThanOrEqual(1_000);
  });

  it("streams a production-sized catalog through bounded database batches", async () => {
    const recordCount = 617_000;
    async function* rows() {
      for (let index = 0; index < recordCount; index += 1) {
        const hex = index.toString(16).padStart(6, "0");
        yield `${hex};OK-${index};A320;1;Airbus;2020;Example\n`;
      }
    }

    const batchSizes: number[] = [];
    const table = {
      delete: () => ({ where: () => ({ build: () => ({ kind: "delete" }) }) }),
      insert: (records: unknown[]) => ({ build: () => ({ kind: "insert", count: records.length }) }),
    };
    const database = {
      transaction: async (callback: (transaction: unknown) => Promise<void>) => callback({
        sql: { public: { aircraftMetadataCache: table } },
        execute: async (plan: { kind: string; count?: number }) => {
          if (plan.kind === "insert") batchSizes.push(plan.count ?? 0);
        },
      }),
    };
    const catalog = new AircraftMetadataCatalog(null, "test://catalog");
    const downloaded = {
      etag: null,
      datasetVersion: "dataset-1",
      stream: Readable.from(rows()).pipe(createGzip()),
      recordCount: 0,
    };

    await (catalog as unknown as { writeCatalog: (database: unknown, downloaded: unknown) => Promise<void> })
      .writeCatalog(database, downloaded);

    expect(downloaded.recordCount).toBe(recordCount);
    expect(batchSizes).toHaveLength(Math.ceil(recordCount / METADATA_IMPORT_BATCH_SIZE));
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(METADATA_IMPORT_BATCH_SIZE);
    expect(batchSizes.reduce((total, size) => total + size, 0)).toBe(recordCount);
  }, 60_000);
});
