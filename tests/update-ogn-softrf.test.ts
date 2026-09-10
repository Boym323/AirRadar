import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// The updater intentionally remains a directly executable JavaScript module;
// its focused tests exercise the public function through the module boundary.
// @ts-expect-error The standalone .mjs utility has no application type declaration.
import { updateSoftRf } from "../scripts/update-ogn-softrf.mjs";

const NOW = Date.parse("2026-09-10T12:00:00.000Z");
const roots: string[] = [];

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name: string, data: Buffer, offset: number) {
  const nameBytes = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);
  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(offset, 42);
  nameBytes.copy(central, 46);
  return { local, central };
}

function makeZip(entries: Array<[string, Buffer]>) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const entry = zipEntry(name, data, offset);
    locals.push(entry.local, data);
    centrals.push(entry.central);
    offset += entry.local.length + data.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

function makeDatabase(rowCount = 105, idOffset = 0): { bytes: Buffer; directory: string } {
  const directory = path.join(os.tmpdir(), `airradar-softrf-updater-${Math.random().toString(16).slice(2)}`);
  mkdirSync(directory, { recursive: true });
  roots.push(directory);
  const databasePath = path.join(directory, "source.db");
  const database = new DatabaseSync(databasePath);
  database.exec("CREATE TABLE devices (type INTEGER NOT NULL, id INTEGER PRIMARY KEY, acmodel TEXT NOT NULL, acreg TEXT NOT NULL, accn TEXT NOT NULL, track INTEGER NOT NULL, ident INTEGER NOT NULL, actype INTEGER NOT NULL)");
  const insert = database.prepare("INSERT INTO devices (type, id, acmodel, acreg, accn, track, ident, actype) VALUES (2, ?, '', '', '', 1, 1, 1)");
  for (let index = 0; index < rowCount; index += 1) insert.run(index + idOffset);
  database.close();
  return { bytes: readFileSync(databasePath), directory };
}

function apiFetcher({ runId = 123, createdAt = "2026-09-10T07:53:36Z", missingCreatedAt = false, artifactId = 456, archive = makeZip([]), archiveStatus = 200, runPath = ".github/workflows/adb.yml", artifactName = "Data" }: { runId?: number; createdAt?: string | null; missingCreatedAt?: boolean; artifactId?: number; archive?: Buffer; archiveStatus?: number; runPath?: string; artifactName?: string } = {}) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes("/runs?")) return new Response(JSON.stringify({ workflow_runs: [{ id: runId, status: "completed", conclusion: "success", path: runPath }] }));
    if (url.includes("/artifacts?")) return new Response(JSON.stringify({ artifacts: [{ id: artifactId, name: artifactName, expired: false, ...(missingCreatedAt ? {} : { created_at: createdAt }) }] }));
    return new Response(archiveStatus === 200 ? archive as unknown as BodyInit : "download failed", { status: archiveStatus, headers: { "content-type": "application/zip" } });
  });
  return { fetcher, calls };
}

async function runUpdate(databasePath: string, options: Parameters<typeof apiFetcher>[0] = {}) {
  const { fetcher, calls } = apiFetcher(options);
  const result = updateSoftRf({ databasePath, fetcher, now: () => NOW, timeoutMs: 1_000, maxAgeHours: 168, environment: {} });
  return { result, calls };
}

async function expectRejected(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toThrow(message);
}

function seedSnapshot(databasePath: string, bytes: Buffer): Buffer[] {
  const metadata = Buffer.from(JSON.stringify({ generatedAt: "2026-09-09T07:53:36Z", source: "SoftRF", sourceRunId: "old", sha256: createHash("sha256").update(bytes).digest("hex") }));
  writeFileSync(databasePath, bytes);
  writeFileSync(`${databasePath}.meta.json`, metadata);
  return [Buffer.from(bytes), metadata];
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("SoftRF operational updater", () => {
  it("installs a valid artifact and writes a hash-bound sidecar", async () => {
    const source = makeDatabase();
    const target = path.join(source.directory, "ogn", "softrf", "ogn.db");
    const { result } = await runUpdate(target, { archive: makeZip([["db/ogn.db", source.bytes], ["README.txt", Buffer.from("Data")]]) });
    await expect(result).resolves.toMatchObject({ installed: true, runId: "123", recordCount: 105 });
    const installed = readFileSync(target);
    const metadata = JSON.parse(readFileSync(`${target}.meta.json`, "utf8"));
    expect(metadata).toEqual({ generatedAt: "2026-09-10T07:53:36Z", source: "SoftRF", sourceRunId: "123", sha256: createHash("sha256").update(installed).digest("hex") });
  });

  it("leaves an existing snapshot untouched when the download fails", async () => {
    const source = makeDatabase();
    const target = path.join(source.directory, "ogn.db");
    writeFileSync(target, source.bytes);
    writeFileSync(`${target}.meta.json`, JSON.stringify({ generatedAt: "2026-09-10T07:00:00Z", source: "SoftRF", sourceRunId: "old", sha256: createHash("sha256").update(source.bytes).digest("hex") }));
    const before = [readFileSync(target), readFileSync(`${target}.meta.json`)];
    const { result } = await runUpdate(target, { archiveStatus: 500 });
    await expectRejected(result, "HTTP 500");
    expect(readFileSync(target)).toEqual(before[0]);
    expect(readFileSync(`${target}.meta.json`)).toEqual(before[1]);
  });

  it.each([
    ["invalid ZIP", Buffer.from("not a zip"), "valid ZIP"],
    ["missing db/ogn.db", makeZip([["README.txt", Buffer.from("no database")]]), "missing db/ogn.db"],
    ["invalid SQLite", makeZip([["db/ogn.db", Buffer.from("not sqlite")]]), "SQLite database cannot be opened read-only"],
  ])("rejects %s and leaves the active snapshot untouched", async (_label: string, archive: Buffer, message: string) => {
    const source = makeDatabase();
    const target = path.join(source.directory, "ogn.db");
    const before = seedSnapshot(target, source.bytes);
    const { result } = await runUpdate(target, { archive });
    await expectRejected(result, message);
    expect(readFileSync(target)).toEqual(before[0]);
    expect(readFileSync(`${target}.meta.json`)).toEqual(before[1]);
  });

  it("rejects an empty database", async () => {
    const source = makeDatabase(0);
    const target = path.join(source.directory, "ogn.db");
    const existing = makeDatabase();
    const before = seedSnapshot(target, existing.bytes);
    const { result } = await runUpdate(target, { archive: makeZip([["db/ogn.db", source.bytes]]) });
    await expectRejected(result, "row count is invalid");
    expect(readFileSync(target)).toEqual(before[0]);
    expect(readFileSync(`${target}.meta.json`)).toEqual(before[1]);
  });

  it.each([
    ["expired", "2026-09-02T11:59:59Z", "older than configured TTL"],
    ["future", "2026-09-10T12:06:00Z", "too far in the future"],
    ["missing artifact metadata", undefined, "missing or not a UTC timestamp"],
    ["wrong workflow", "2026-09-10T07:53:36Z", "no successful SoftRF aircraft database workflow run found"],
  ])("rejects %s artifacts", async (_label: string, createdAt: string | undefined, message: string) => {
    const source = makeDatabase();
    const target = path.join(source.directory, "ogn.db");
    const existing = makeDatabase();
    const before = seedSnapshot(target, existing.bytes);
    const { result } = await runUpdate(target, { createdAt, missingCreatedAt: _label === "missing artifact metadata", runPath: _label === "wrong workflow" ? ".github/workflows/main.yml" : ".github/workflows/adb.yml", archive: makeZip([["db/ogn.db", source.bytes]]) });
    await expectRejected(result, message);
    expect(readFileSync(target)).toEqual(before[0]);
    expect(readFileSync(`${target}.meta.json`)).toEqual(before[1]);
  });

  it("does not download or rewrite the same installed run and hash", async () => {
    const source = makeDatabase();
    const target = path.join(source.directory, "ogn.db");
    const hash = createHash("sha256").update(source.bytes).digest("hex");
    writeFileSync(target, source.bytes);
    writeFileSync(`${target}.meta.json`, JSON.stringify({ generatedAt: "2026-09-10T07:53:36Z", source: "SoftRF", sourceRunId: "123", sha256: hash }));
    const { result, calls } = await runUpdate(target, { archive: makeZip([["db/ogn.db", Buffer.from("different")]]) });
    await expect(result).resolves.toMatchObject({ installed: false, skipped: true, sha256: hash });
    expect(calls).toHaveLength(2);
    expect(readFileSync(target)).toEqual(source.bytes);
  });

  it("atomically replaces an older valid run", async () => {
    const old = makeDatabase(105, 0);
    const next = makeDatabase(105, 1000);
    const target = path.join(old.directory, "ogn.db");
    writeFileSync(target, old.bytes);
    writeFileSync(`${target}.meta.json`, JSON.stringify({ generatedAt: "2026-09-09T07:53:36Z", source: "SoftRF", sourceRunId: "old", sha256: createHash("sha256").update(old.bytes).digest("hex") }));
    const { result } = await runUpdate(target, { runId: 124, archive: makeZip([["db/ogn.db", next.bytes]]) });
    await expect(result).resolves.toMatchObject({ installed: true, runId: "124" });
    expect(readFileSync(target)).toEqual(next.bytes);
    expect(JSON.parse(readFileSync(`${target}.meta.json`, "utf8")).sha256).toBe(createHash("sha256").update(next.bytes).digest("hex"));
  });
});
