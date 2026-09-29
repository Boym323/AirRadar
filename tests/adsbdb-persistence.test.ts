import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AircraftMetadata } from "@/lib/aircraft/types";
import { AdsbDbPersistence } from "@/lib/server/adsbdb-persistence";
import { EnrichmentService, metadataCacheKey } from "@/lib/server/enrichment-cache";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function metadata(): AircraftMetadata {
  return {
    registration: "OK-ABC", registrationCountry: "Czech Republic", registrationCountryCode: "CZ",
    aircraftType: "A320", icaoTypeCode: "A320", aircraftDescription: "Airbus A320", operator: "Test Air",
    manufacturer: "Airbus", source: "adsbdb", retrievedAt: "2026-09-12T12:00:00.000Z",
  };
}

async function cacheFile(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "airradar-adsbdb-"));
  roots.push(root);
  return path.join(root, "adsbdb-cache-v1.json");
}

describe("persistent ADSBDB cache", () => {
  const options = (file: string, now: () => number, checkpointIntervalMs = 60 * 60_000) => ({
    cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
    metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
    metadataMaxEntries: 2, routeMaxEntries: 2, checkpointIntervalMs, now,
  });

  it("waits for the first dirty deadline instead of debouncing mutations", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-12T12:00:00.000Z") });
    try {
      const file = await cacheFile();
      const cache = new AdsbDbPersistence(options(file, Date.now));
      for (let index = 0; index < 1_000; index += 1) cache.set("metadata", metadataCacheKey("abc123"), metadata());
      expect(cache.getDiagnostics()).toMatchObject({ writes: 0, periodicCheckpoints: 0, dirty: true });
      await vi.advanceTimersByTimeAsync(59 * 60_000);
      expect(cache.getDiagnostics().writes).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      await cache.flush("explicit");
      expect(cache.getDiagnostics()).toMatchObject({ writes: 1, periodicCheckpoints: 1, dirty: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports shutdown-only mode and an explicit flush", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-12T12:00:00.000Z") });
    try {
      const file = await cacheFile();
      const cache = new AdsbDbPersistence(options(file, Date.now, 0));
      cache.set("metadata", metadataCacheKey("abc123"), metadata());
      await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
      expect(cache.getDiagnostics().writes).toBe(0);
      await cache.flush("explicit");
      expect(cache.getDiagnostics()).toMatchObject({ writes: 1, periodicCheckpoints: 0, explicitCheckpoints: 1, dirty: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes through the enrichment service graceful-close path", async () => {
    const file = await cacheFile();
    const cache = new AdsbDbPersistence(options(file, Date.now, 0));
    cache.set("metadata", metadataCacheKey("abc123"), metadata());
    const service = new EnrichmentService({}, undefined, cache);
    await service.close();
    expect(cache.getDiagnostics()).toMatchObject({ writes: 1, gracefulCheckpoints: 1, explicitCheckpoints: 0, dirty: false });
  });

  it("keeps newer mutations dirty when they arrive during a checkpoint", async () => {
    const file = await cacheFile();
    const cache = new AdsbDbPersistence(options(file, Date.now));
    cache.set("metadata", metadataCacheKey("abc123"), metadata());
    const save = cache.flush("periodic");
    cache.set("metadata", metadataCacheKey("def456"), metadata());
    await save;
    expect(cache.getDiagnostics()).toMatchObject({ writes: 1, persistedGeneration: 1, mutationGeneration: 2, dirty: true });
    await cache.flush("explicit");
    expect(cache.getDiagnostics()).toMatchObject({ writes: 2, persistedGeneration: 2, dirty: false });
  });

  it("retains the dirty generation and backs off after a failed checkpoint", async () => {
    vi.useFakeTimers();
    try {
      const file = await cacheFile();
      const cache = new AdsbDbPersistence({ ...options(file, Date.now), metadataMaxEntries: 10, maxBytes: 1_024 });
      cache.set("metadata", metadataCacheKey("abc123"), metadata());
      cache.set("metadata", metadataCacheKey("def456"), metadata());
      cache.set("metadata", metadataCacheKey("fedcba"), metadata());
      await cache.flush("periodic");
      expect(cache.getDiagnostics()).toMatchObject({ dirty: true, mutationGeneration: 3, persistedGeneration: 0, checkpointFailures: 1, writes: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes a bounded versioned snapshot and hydrates fresh entries", async () => {
    let now = Date.parse("2026-09-12T12:00:00.000Z");
    const file = await cacheFile();
    const first = new AdsbDbPersistence({
      cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
      metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
      metadataMaxEntries: 2, routeMaxEntries: 2, now: () => now,
    });
    first.set("metadata", metadataCacheKey("abc123"), metadata(), now);
    await first.flush();

    const payload = JSON.parse(await readFile(file, "utf8")) as { schemaVersion: number; metadata: unknown[]; routes: unknown[] };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.metadata).toHaveLength(1);
    expect(payload.routes).toHaveLength(0);

    now += 12 * 60 * 60_000;
    const second = new AdsbDbPersistence({
      cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
      metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
      metadataMaxEntries: 2, routeMaxEntries: 2, now: () => now,
    });
    expect(second.get("metadata", metadataCacheKey("ABC123"))).toMatchObject({ fresh: true, value: metadata() });
    expect(second.getDiagnostics()).toMatchObject({ loadedFromDisk: true, loadedMetadataEntries: 1, lastLoadError: null });
  });

  it("returns a persisted value stale within the route retention window", async () => {
    let now = Date.parse("2026-09-12T12:00:00.000Z");
    const file = await cacheFile();
    const cache = new AdsbDbPersistence({
      cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
      metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
      metadataMaxEntries: 2, routeMaxEntries: 2, now: () => now,
    });
    cache.set("route", "flight-route:ABC123:TEST123:2026-09-12", {
      callsign: "TEST123", airline: "Test Air", airlineIcao: null, airlineIata: null,
      origin: "LKPR", destination: "EDDF", originAirport: null, destinationAirport: null,
      source: "adsbdb", retrievedAt: new Date(now).toISOString(),
    }, now);
    await cache.flush();
    now += 12 * 60 * 60_000;
    const loaded = new AdsbDbPersistence({
      cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
      metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
      metadataMaxEntries: 2, routeMaxEntries: 2, now: () => now,
    });
    expect(loaded.get("route", "flight-route:ABC123:TEST123:2026-09-12")).toMatchObject({ fresh: false });
  });

  it("uses stale ADSBDB data only for provider errors, not a valid miss", async () => {
    let now = Date.parse("2026-09-12T12:00:00.000Z");
    const file = await cacheFile();
    const persistence = new AdsbDbPersistence({
      cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
      metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
      metadataMaxEntries: 2, routeMaxEntries: 2, now: () => now,
    });
    persistence.set("metadata", metadataCacheKey("ABC123"), metadata(), now);
    await persistence.flush();
    now += 2 * 24 * 60 * 60_000;

    const failing = new EnrichmentService(
      { aircraftMetadata: { name: "adsbdb", getMetadata: vi.fn().mockRejectedValue(new Error("timeout")) } },
      undefined,
      new AdsbDbPersistence({
        cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
        metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
        metadataMaxEntries: 2, routeMaxEntries: 2, now: () => now,
      }),
    );
    const target = { icaoHex: "ABC123" } as Parameters<EnrichmentService["enrich"]>[0];
    await expect(failing.enrich(target, new Date(now))).resolves.toMatchObject({ metadata: metadata() });
    expect(failing.getDiagnostics().adsbdb.hits.staleFallback).toBe(1);

    const missing = new EnrichmentService(
      { aircraftMetadata: { name: "adsbdb", getMetadata: vi.fn().mockResolvedValue(null) } },
      undefined,
      new AdsbDbPersistence({
        cacheFile: file, metadataTtlMs: 24 * 60 * 60_000, routeTtlMs: 6 * 60 * 60_000,
        metadataMaxStaleMs: 7 * 24 * 60 * 60_000, routeMaxStaleMs: 24 * 60 * 60_000,
        metadataMaxEntries: 2, routeMaxEntries: 2, now: () => now,
      }),
    );
    await expect(missing.enrich(target, new Date(now))).resolves.toBeNull();
    expect(missing.getDiagnostics().adsbdb.persistence.loadedMetadataEntries).toBe(1);
    expect(missing.getDiagnostics().adsbdb.hits.staleFallback).toBe(0);
  });
});
