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

  it("reports real successful SQL latency P50/P95/P99 in bounded 60-minute windows", () => {
    let now = Date.parse("2026-10-11T12:00:00.000Z");
    const metrics = new RouteEnrichmentTelemetry(null, () => now);
    for (let i = 1; i <= 100; i++) metrics.recordDbLatency(i);
    expect(metrics.getDbLatencyDistribution()).toMatchObject({
      processLocal: true, windowMinutes: 60, sampleCount: 100,
      p50Ms: 50, p95Ms: 95, p99Ms: 99, maxMs: 100,
    });
    now += 61 * 60_000;
    expect(metrics.getDbLatencyDistribution()).toMatchObject({
      sampleCount: 0, p50Ms: null, p99Ms: null,
    });
    for (let i = 1; i <= 1200; i++) metrics.recordDbLatency(i);
    expect(metrics.getDbLatencyDistribution()).toMatchObject({
      sampleCount: 1024, p50Ms: 688, p95Ms: 1149, p99Ms: 1190,
    });
    expect(metrics.getDbLatencyDistribution().source).toBe("successful-route-cache-db-call-elapsed");
  });

  it("keeps RAM lookup, read-through load, route resolution and PostgreSQL request metrics distinct", () => {
    const metrics = new RouteEnrichmentTelemetry(null, () => Date.parse("2026-10-11T12:00:00.000Z"));
    metrics.recordPhase("memoryLookup", 1);
    metrics.recordPhase("readThroughLoad", 40);
    metrics.recordPhase("routeResolution", 42);
    metrics.recordPhase("postgresCacheRequest", 12);
    const phases = metrics.getSnapshot().phases;
    expect(phases.memoryLookup.p50Ms).toBe(1);
    expect(phases.readThroughLoad.p50Ms).toBe(40);
    expect(phases.routeResolution.p50Ms).toBe(42);
    expect(phases.postgresCacheRequest.p50Ms).toBe(12);
    expect(phases.memoryLookup.scope).toBe("process-local-recent-samples");
    expect(phases.memoryLookup).toMatchObject({ sampleCapacity: 1_024 });
    expect(phases.dbConnection).toMatchObject({ measured: false, p95Ms: null });
    expect(metrics.getSnapshot().phases).not.toHaveProperty("sqlExecution");
    expect(metrics.getSnapshot().phases).not.toHaveProperty("sqlCompletion");
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
