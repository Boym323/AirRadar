import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AviationWeatherProvider } from "@/lib/server/aviation-weather-provider";
import { AviationWeatherPersistence } from "@/lib/server/aviation-weather-persistence";

const polygon = [[[14, 49], [15, 49], [15, 50], [14, 49]]];

function sigmet(id: string, validTo = "2026-09-09T13:00:00Z") {
  return {
    type: "Feature", id,
    properties: {
      icaoId: "LKAA", firId: "LKAA", firName: "Prague FIR", seriesId: "A1", hazard: "SEV TURB", qualifier: "OBS",
      validTimeFrom: "2026-09-09T11:00:00Z", validTimeTo: validTo, base: "FL100", top: "FL300", rawSigmet: "SIGMET A1 SEV TURB",
    },
    geometry: { type: "Polygon", coordinates: polygon },
  };
}

function geoJson(features: unknown[]) {
  return { type: "FeatureCollection", features };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/geo+json" } });
}

function weatherFile(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "airradar-weather-")), "weather-cache-v1.json");
}

const files: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const file of files.splice(0)) rmSync(path.dirname(file), { recursive: true, force: true });
});

describe("persistent aviation weather cache", () => {
  it("loads a last-known-good SIGMET snapshot after restart and rechecks validity", async () => {
    const file = weatherFile();
    files.push(file);
    let now = Date.parse("2026-09-09T12:00:00Z");
    const initialFetcher = vi.fn()
      .mockResolvedValueOnce(response(geoJson([sigmet("cached")])));
    initialFetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const initial = new AviationWeatherProvider({
      fetcher: initialFetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 10,
      persistenceMaxAgeMs: 24 * 60 * 60_000, persistCache: true, cacheFile: file,
    });
    await expect(initial.getSigmets()).resolves.toMatchObject({ features: [{ id: "cached" }], stale: false });
    await initial.flushPersistence();
    const persisted = JSON.parse(readFileSync(file, "utf8")) as { version: number; entries: Array<{ product: string; key: string }> };
    expect(persisted.version).toBe(1);
    expect(persisted.entries).toContainEqual(expect.objectContaining({ product: "sigmet", key: "isigmet" }));

    now += 11;
    const restartedFetcher = vi.fn().mockRejectedValue(new Error("provider offline"));
    const restarted = new AviationWeatherProvider({
      fetcher: restartedFetcher, now: () => now, sigmetTtlMs: 10, staleIfErrorMs: 10,
      persistenceMaxAgeMs: 24 * 60 * 60_000, persistCache: true, cacheFile: file,
    });
    const stale = await restarted.getSigmets();
    expect(stale).toMatchObject({ stale: true, features: [{ id: "cached" }] });
    expect(restartedFetcher).toHaveBeenCalledTimes(2);

    now = Date.parse("2026-09-09T13:15:00Z");
    const expired = await restarted.getSigmets();
    expect(expired).toMatchObject({ stale: true, features: [] });
  });

  it("persists METAR/TAF negative and positive last-known-good values", async () => {
    const file = weatherFile();
    files.push(file);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response([{ icaoId: "LKPR", issueTime: "2026-09-09T12:00:00Z", validTimeFrom: "2026-09-09T12:00:00Z", validTimeTo: "2026-09-10T00:00:00Z", rawTAF: "TAF LKPR", fcsts: [] }], 200));
    const provider = new AviationWeatherProvider({ fetcher, now: () => Date.parse("2026-09-09T12:00:00Z"), persistCache: true, cacheFile: file });
    await provider.getAirportWeather("LKPR");
    await provider.flushPersistence();

    const restartedFetcher = vi.fn().mockRejectedValue(new Error("provider offline"));
    const restarted = new AviationWeatherProvider({ fetcher: restartedFetcher, now: () => Date.parse("2026-09-09T12:01:00Z"), persistCache: true, cacheFile: file });
    await expect(restarted.getAirportWeather("LKPR")).resolves.toMatchObject({ metar: null, taf: { rawText: "TAF LKPR" }, stale: true, cacheSource: "persistent-cache" });
    expect(restartedFetcher).not.toHaveBeenCalled();
  });

  it("ignores corrupted persistence without preventing startup", async () => {
    const file = weatherFile();
    files.push(file);
    writeFileSync(file, "{not-json", "utf8");
    const provider = new AviationWeatherProvider({ persistCache: true, cacheFile: file, fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) });
    expect(provider.getDiagnostics().persistence).toMatchObject({ enabled: true, loadedFromDisk: false, lastLoadError: "invalid_json" });
    await expect(provider.getAirportWeather("LKPR")).resolves.toMatchObject({ metar: null, taf: null });
    await provider.flushPersistence();
  });

  it("rejects wrong versions, future timestamps, and over-age METAR entries", async () => {
    const file = weatherFile();
    files.push(file);
    const now = Date.parse("2026-09-09T12:00:00Z");
    writeFileSync(file, JSON.stringify({ version: 99, savedAt: new Date(now).toISOString(), entries: [] }), "utf8");
    const wrongVersion = new AviationWeatherProvider({ persistCache: true, cacheFile: file, now: () => now });
    expect(wrongVersion.getDiagnostics().persistence.lastLoadError).toBe("invalid_structure");

    writeFileSync(file, JSON.stringify({ version: 1, savedAt: new Date(now).toISOString(), entries: [{ product: "metar", key: "LKPR", fetchedAt: new Date(now + 60 * 60_000).toISOString(), value: null }] }), "utf8");
    const future = new AviationWeatherProvider({ persistCache: true, cacheFile: file, now: () => now });
    expect(future.getDiagnostics().persistence).toMatchObject({ loadedFromDisk: true, diskEntriesLoaded: 0, diskEntriesRejected: 1 });

    writeFileSync(file, JSON.stringify({ version: 1, savedAt: new Date(now).toISOString(), entries: [{ product: "metar", key: "LKPR", fetchedAt: new Date(now - 3 * 60 * 60_000).toISOString(), value: null }] }), "utf8");
    const overAge = new AviationWeatherProvider({ persistCache: true, cacheFile: file, now: () => now, fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) });
    await expect(overAge.getAirportWeather("LKPR")).resolves.toMatchObject({ metar: null, taf: null });
  });

  it("keeps write and read failures fail-soft and writes atomically", async () => {
    const file = weatherFile();
    files.push(file);
    const now = Date.parse("2026-09-09T12:00:00Z");
    const persistence = new AviationWeatherPersistence({
      cacheFile: file, maxAgeMs: 60 * 60_000, maxEntries: 2, maxBytes: 1_024, now: () => now,
      validateValue: () => ({ valid: true, value: null }),
    });
    persistence.schedule([{ product: "metar", key: "LKPR", fetchedAt: new Date(now).toISOString(), value: "x".repeat(2_000) }]);
    await expect(persistence.flush()).resolves.toBeUndefined();
    expect(persistence.getDiagnostics().lastSaveError).toBe("payload_too_large");

    const atomic = new AviationWeatherPersistence({
      cacheFile: file, maxAgeMs: 60 * 60_000, maxEntries: 2, now: () => now,
      validateValue: () => ({ valid: true, value: null }),
    });
    atomic.schedule([{ product: "metar", key: "LKPR", fetchedAt: new Date(now).toISOString(), value: null }]);
    await atomic.flush();
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ version: 1, entries: [{ product: "metar", key: "LKPR", value: null }] });
    expect(() => readFileSync(`${file}.tmp`)).toThrow();
  });
});
