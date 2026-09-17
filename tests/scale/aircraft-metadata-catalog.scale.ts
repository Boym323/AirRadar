import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { AircraftMetadataCatalog, METADATA_IMPORT_BATCH_SIZE } from "@/lib/server/aircraft-metadata-catalog";

describe("aircraft metadata catalog production scale", () => {
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
