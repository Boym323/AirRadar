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
