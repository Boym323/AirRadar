import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OgnDdb } from "@/lib/ogn/ddb";
import { applyOgnPrivacy } from "@/lib/ogn/privacy";
import type { OgnPosition } from "@/lib/ogn/types";

const now = Date.parse("2026-09-10T12:00:00.000Z");
const directories: string[] = [];

function makeSnapshot(rows: Array<{ type?: number; id?: number; track?: number; ident?: number }>, ageMs = 0): string {
  const directory = os.tmpdir();
  const name = `airradar-softrf-${Math.random().toString(16).slice(2)}`;
  const root = path.join(directory, name);
  mkdirSync(root, { recursive: true });
  directories.push(root);
  const databasePath = path.join(root, "ogn.db");
  const database = new DatabaseSync(databasePath);
  database.exec("CREATE TABLE devices (type INTEGER NOT NULL, id INTEGER PRIMARY KEY, acmodel TEXT NOT NULL, acreg TEXT NOT NULL, accn TEXT NOT NULL, track INTEGER NOT NULL, ident INTEGER NOT NULL, actype INTEGER NOT NULL)");
  const insert = database.prepare("INSERT INTO devices (type, id, acmodel, acreg, accn, track, ident, actype) VALUES (?, ?, '', '', '', ?, ?, 1)");
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    insert.run(row.type ?? 2, row.id ?? index, row.track ?? 1, row.ident ?? 1);
  }
  database.close();
  const timestamp = (now - ageMs) / 1_000;
  utimesSync(databasePath, timestamp, timestamp);
  return databasePath;
}

function rowsWith(target: { type?: number; id?: number; track?: number; ident?: number }) {
  return [target, ...Array.from({ length: 104 }, (_, index) => ({ type: 2, id: index + 1 }))];
}

function failingFetcher() {
  return vi.fn().mockRejectedValue(new Error("ECONNRESET")) as unknown as typeof fetch;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("SoftRF OGN DDB emergency whitelist", () => {
  it("reads the real devices schema and normalizes numeric IDs without importing metadata", () => {
    const databasePath = makeSnapshot(rowsWith({ type: 2, id: 0x8e20f0 }));
    const ddb = new OgnDdb({ now: () => now, fetcher: failingFetcher(), softrfEnabled: true, softrfPath: databasePath });
    expect(ddb.getResolution("F", "8e20f0")).toMatchObject({ status: "found", source: "softrf", entry: { deviceType: "F", deviceId: "8E20F0", tracked: "Y", identified: "Y", registration: null, aircraftModel: null } });
    expect(ddb.getDiagnostics()).toMatchObject({ source: "softrf", softRf: { enabled: true, valid: true, recordCount: 105 } });
  });

  it("keeps official live data ahead of SoftRF", async () => {
    const databasePath = makeSnapshot(rowsWith({ type: 2, id: 0x8e20f0 }));
    const official = { device_type: "F", device_id: "8E20F0", tracked: "Y", identified: "N" };
    const ddb = new OgnDdb({ now: () => now, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ devices: [official] }))) as unknown as typeof fetch, softrfEnabled: true, softrfPath: databasePath });
    await ddb.refresh();
    expect(ddb.getResolution("F", "8E20F0")).toMatchObject({ source: "live", entry: { identified: "N" } });
  });

  it("keeps the official persistent cache ahead of SoftRF", async () => {
    const databasePath = makeSnapshot(rowsWith({ type: 2, id: 0x8e20f0 }));
    const cachePath = path.join(path.dirname(databasePath), "official-cache.json");
    const official = { device_type: "F", device_id: "8E20F0", tracked: "Y", identified: "N" };
    const first = new OgnDdb({ now: () => now, fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify({ devices: [official] }))) as unknown as typeof fetch, persistCache: true, cacheFile: cachePath });
    await first.refresh();
    await first.stop();
    const second = new OgnDdb({ now: () => now, fetcher: failingFetcher(), persistCache: true, cacheFile: cachePath, softrfEnabled: true, softrfPath: databasePath });
    expect(second.getResolution("F", "8E20F0")).toMatchObject({ source: "cache", entry: { identified: "N" } });
  });

  it.each([
    ["track=0", { track: 0, ident: 1 }],
    ["ident=0", { track: 1, ident: 0 }],
  ])("does not whitelist a SoftRF row with %s", (_label, flags) => {
    const databasePath = makeSnapshot(rowsWith({ type: 2, id: 0x8e20f0, ...flags }));
    const ddb = new OgnDdb({ now: () => now, fetcher: failingFetcher(), softrfEnabled: true, softrfPath: databasePath });
    expect(ddb.getResolution("F", "8E20F0")).toEqual({ status: "unresolved" });
  });

  it("maps a valid SoftRF whitelist hit to SHOW and an absent ID to HIDE", () => {
    const databasePath = makeSnapshot(rowsWith({ type: 2, id: 0x8e20f0 }));
    const ddb = new OgnDdb({ now: () => now, fetcher: failingFetcher(), softrfEnabled: true, softrfPath: databasePath });
    const position = { id: { noTracking: false, stealth: false } } as OgnPosition;
    expect(applyOgnPrivacy({ position, ddbResolution: ddb.getResolution("F", "8E20F0") })).toMatchObject({ action: "identified" });
    expect(applyOgnPrivacy({ position, ddbResolution: ddb.getResolution("F", "ABCDEF") })).toMatchObject({ action: "drop", reason: "ddb-unresolved" });
  });

  it("fails closed for expired or corrupt SQLite and preserves a valid active snapshot on bad reload", () => {
    const databasePath = makeSnapshot(rowsWith({ type: 2, id: 0x8e20f0 }), 169 * 60 * 60_000);
    const expired = new OgnDdb({ now: () => now, fetcher: failingFetcher(), softrfEnabled: true, softrfPath: databasePath });
    expect(expired.getResolution("F", "8E20F0")).toEqual({ status: "unresolved" });
    expect(expired.getDiagnostics().softRf).toMatchObject({ valid: false, lastLoadError: "SNAPSHOT_EXPIRED" });

    const validPath = makeSnapshot(rowsWith({ type: 2, id: 0x8e20f0 }));
    const ddb = new OgnDdb({ now: () => now, fetcher: failingFetcher(), softrfEnabled: true, softrfPath: validPath });
    writeFileSync(validPath, "not sqlite");
    expect(ddb.refreshSoftRf()).toBe(false);
    expect(ddb.getResolution("F", "8E20F0")).toMatchObject({ status: "found", source: "softrf" });
  });

  it("rejects empty snapshots", () => {
    const databasePath = makeSnapshot([]);
    const ddb = new OgnDdb({ now: () => now, fetcher: failingFetcher(), softrfEnabled: true, softrfPath: databasePath });
    expect(ddb.getDiagnostics().softRf).toMatchObject({ valid: false, recordCount: 0, lastLoadError: "COUNT_INVALID" });
    expect(ddb.getResolution("F", "8E20F0")).toEqual({ status: "unresolved" });
  });
});
