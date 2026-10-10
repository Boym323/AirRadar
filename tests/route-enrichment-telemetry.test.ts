import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RouteEnrichmentTelemetry } from "@/lib/server/route-enrichment-telemetry";

const HOUR = 3_600_000;

describe("route enrichment telemetry", () => {
  it("counts real cache and provider events across UTC hours and computes hit rate", () => {
    let now = Date.parse("2026-10-10T13:00:00.000Z");
    const metrics = new RouteEnrichmentTelemetry(null, () => now);
    metrics.record("dbHit", 3);
    metrics.record("dbMiss", 1);
    metrics.record("ramHit", 2);
    metrics.record("adsbdbLookup");
    metrics.record("adsblolBatch");
    metrics.record("adsblolLookup", 5);
    metrics.recordDbLatency(32);
    metrics.setValidEntries(27);
    now += HOUR;
    metrics.record("dbWrite", 2);
    const result = metrics.getSnapshot();
    expect(result.buckets).toHaveLength(24);
    expect(result.databaseHitRate).toBe(0.75);
    expect(result.estimatedSavedLookups).toBe(5);
    expect(result.validEntries).toBe(27);
    expect(result.databaseAverageLatencyMs).toBe(32);
    expect(result.totals.adsblolBatch).toBe(1);
    expect(result.totals.adsblolLookup).toBe(5);
    expect(result.buckets.at(-2)?.dbHit).toBe(3);
    expect(result.buckets.at(-1)?.dbWrite).toBe(2);
    now += 24 * HOUR;
    expect(metrics.getSnapshot().totals.dbHit).toBe(0);
    expect(metrics.getSnapshot().estimatedSavedLookups).toBe(0);
  });

  it("saves only bounded aggregate history and restores it without callsigns or positions", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "airradar-route-metrics-"));
    const file = path.join(directory, "history.json");
    let now = Date.parse("2026-10-10T13:00:00.000Z");
    try {
      const metrics = new RouteEnrichmentTelemetry(file, () => now);
      metrics.record("dbHit", 4);
      metrics.record("adsbdbLookup", 1);
      await metrics.flush();
      const saved = await readFile(file, "utf8");
      expect(saved).not.toContain("ABC123");
      expect(JSON.parse(saved).version).toBe(1);
      const restored = new RouteEnrichmentTelemetry(file, () => now);
      expect(restored.getSnapshot().totals.dbHit).toBe(4);
      expect(restored.getSnapshot().telemetry.loadedFromDisk).toBe(true);
      now += 26 * HOUR;
      const expired = new RouteEnrichmentTelemetry(file, () => now);
      expect(expired.getSnapshot().totals.dbHit).toBe(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

});
