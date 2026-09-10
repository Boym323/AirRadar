import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OgnDdb } from "@/lib/ogn/ddb";

const device = {
  device_type: "F",
  device_id: "ABCDEF",
  aircraft_model: "LS8",
  registration: "OK-TEST",
  cn: "AB",
  tracked: "Y",
  identified: "Y",
  aircraft_type: 1,
};

function response(devices: unknown[]) {
  return new Response(JSON.stringify({ devices }), { status: 200, headers: { "content-type": "application/json" } });
}

async function temporaryCacheFile(): Promise<{ directory: string; file: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "airradar-ogn-ddb-"));
  return { directory, file: path.join(directory, "ogn-ddb-cache-v1.json") };
}

async function resolveTargeted(file: string, now: () => number, devices: unknown[], options: Record<string, unknown> = {}): Promise<OgnDdb> {
  const ddb = new OgnDdb({
    fetcher: vi.fn().mockResolvedValue(response(devices)) as unknown as typeof fetch,
    persistCache: true,
    cacheFile: file,
    now,
    batchDelayMs: 0,
    minRequestIntervalMs: 0,
    ...options,
  });
  ddb.start();
  ddb.ensure("F", "ABCDEF");
  await new Promise((resolve) => setTimeout(resolve, 15));
  return ddb;
}

afterEach(() => vi.useRealTimers());

describe("persistent OGN DDB cache", () => {
  it("survives a restart without resetting the privacy age during an upstream outage", async () => {
    const { directory, file } = await temporaryCacheFile();
    try {
      const resolvedAt = Date.parse("2026-09-10T12:00:00.000Z");
      const first = await resolveTargeted(file, () => resolvedAt, [device]);
      await first.stop();

      const afterRestart = resolvedAt + 2 * 60 * 60_000;
      const second = new OgnDdb({
        persistCache: true,
        cacheFile: file,
        now: () => afterRestart,
        fetcher: vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch,
        refreshMs: 60_000,
        maxStaleMs: 24 * 60 * 60_000,
      });
      expect(second.getResolution("F", "ABCDEF")).toMatchObject({ status: "found", resolvedAt });
      expect(second.getDiagnostics().persistence).toMatchObject({ loadedFromDisk: true, diskEntriesLoaded: 1, dirty: false });
      expect(JSON.parse(await readFile(file, "utf8")).entries[0].resolvedAt).toBe("2026-09-10T12:00:00.000Z");
      await second.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("restores missing only within the negative TTL and fails closed after it", async () => {
    const { directory, file } = await temporaryCacheFile();
    try {
      const resolvedAt = Date.parse("2026-09-10T12:00:00.000Z");
      const first = await resolveTargeted(file, () => resolvedAt, [], { negativeTtlMs: 30 * 60_000 });
      await first.stop();

      const withinTtl = new OgnDdb({ persistCache: true, cacheFile: file, now: () => resolvedAt + 29 * 60_000, negativeTtlMs: 30 * 60_000 });
      expect(withinTtl.getResolution("F", "ABCDEF").status).toBe("missing");
      await withinTtl.stop();

      const expired = new OgnDdb({ persistCache: true, cacheFile: file, now: () => resolvedAt + 30 * 60_000, negativeTtlMs: 30 * 60_000 });
      expect(expired.getResolution("F", "ABCDEF").status).toBe("unresolved");
      await expired.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects corrupt, duplicate, privacy-invalid, and future entries without trusting them", async () => {
    const { directory, file } = await temporaryCacheFile();
    try {
      const now = Date.parse("2026-09-10T12:00:00.000Z");
      await writeFile(file, JSON.stringify({
        version: 1,
        savedAt: "2026-09-10T12:00:00.000Z",
        entries: [
          { key: "F:ABCDEF", status: "found", resolvedAt: "2026-09-10T11:00:00.000Z", entry: { deviceType: "F", deviceId: "ABCDEF", tracked: "Y", identified: "Y", aircraftModel: "LS8", registration: null, competitionNumber: null, aircraftType: 1 } },
          { key: "F:ABCDEF", status: "found", resolvedAt: "2026-09-10T11:59:00.000Z", entry: { deviceType: "F", deviceId: "ABCDEF", tracked: "Y", identified: "Y", aircraftModel: "PERMISSIVE", registration: null, competitionNumber: null, aircraftType: 1 } },
          { key: "O:111111", status: "found", resolvedAt: "2026-09-10T11:00:00.000Z", entry: { deviceType: "O", deviceId: "111111", tracked: "Y", identified: "Y", aircraftModel: "VALID", registration: null, competitionNumber: null, aircraftType: null } },
          { key: "I:123456", status: "found", resolvedAt: "2026-09-10T11:59:00.000Z", entry: { deviceType: "I", deviceId: "123456", tracked: "MAYBE", identified: "Y", aircraftModel: null, registration: null, competitionNumber: null, aircraftType: null } },
          { key: "O:654321", status: "missing", resolvedAt: "2026-09-10T13:00:00.000Z" },
        ],
      }));
      const ddb = new OgnDdb({ persistCache: true, cacheFile: file, now: () => now, maxStaleMs: 24 * 60 * 60_000 });
      expect(ddb.getResolution("F", "ABCDEF").status).toBe("unresolved");
      expect(ddb.getResolution("O", "111111").status).toBe("found");
      expect(ddb.getResolution("I", "123456").status).toBe("unresolved");
      expect(ddb.getResolution("O", "654321").status).toBe("unresolved");
      expect(ddb.getDiagnostics().persistence).toMatchObject({ diskEntriesLoaded: 1, diskEntriesRejected: 3, lastLoadError: "entries_rejected" });
      await ddb.stop();

      await writeFile(file, '{"version":');
      const corrupt = new OgnDdb({ persistCache: true, cacheFile: file, now: () => now });
      expect(corrupt.getResolution("F", "ABCDEF").status).toBe("unresolved");
      expect(corrupt.getDiagnostics().persistence).toMatchObject({ loadedFromDisk: false, diskEntriesLoaded: 0, lastLoadError: "invalid_json" });
      await corrupt.stop();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("writes atomically with restrictive permissions and coalesces a burst into one write", async () => {
    const { directory, file } = await temporaryCacheFile();
    try {
      const now = Date.parse("2026-09-10T12:00:00.000Z");
      const ddb = new OgnDdb({
        fetcher: vi.fn().mockResolvedValue(response([device])) as unknown as typeof fetch,
        persistCache: true,
        cacheFile: file,
        now: () => now,
        batchSize: 50,
        batchDelayMs: 0,
        minRequestIntervalMs: 0,
        persistenceDebounceMs: 20,
      });
      ddb.start();
      for (let index = 0; index < 10; index += 1) ddb.ensure("F", index.toString(16).padStart(6, "0").toUpperCase());
      await new Promise((resolve) => setTimeout(resolve, 40));
      await ddb.stop();

      const diagnostics = ddb.getDiagnostics().persistence;
      expect(diagnostics.writes).toBe(1);
      expect(diagnostics.lastSaveEntries).toBe(10);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(await readdir(directory)).toEqual(["ogn-ddb-cache-v1.json"]);
      expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ version: 1, entries: expect.any(Array) });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
