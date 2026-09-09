import { describe, expect, it } from "vitest";
import { BoundedTtlLruCache, METADATA_IMPORT_BATCH_SIZE, parseAircraftMetadataCsv } from "@/lib/server/aircraft-metadata-catalog";

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

  it("keeps CSV parsing compatible while exposing a bounded import batch", () => {
    const records = parseAircraftMetadataCsv(
      "hex;registration;type;flags;description;year;operator\nabc123;OK-TEST;A320;1;Airbus;2020;Example",
      "test://catalog",
      "dataset-1",
    );
    expect(records).toMatchObject([{ icaoHex: "ABC123", registration: "OK-TEST", sourceReference: "test://catalog", datasetVersion: "dataset-1" }]);
    expect(METADATA_IMPORT_BATCH_SIZE).toBeGreaterThanOrEqual(1_000);
  });
});
