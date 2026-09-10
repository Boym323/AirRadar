#!/usr/bin/env node

import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmod, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

export const SOFRF_REPOSITORY = "lyusupov/SoftRF";
export const SOFRF_WORKFLOW = "adb.yml";
export const SOFRF_ARTIFACT_NAME = "Data";
export const DEFAULT_DATABASE_PATH = "/var/lib/airradar/ogn/softrf/ogn.db";
export const DEFAULT_MAX_AGE_HOURS = 168;

const GITHUB_API = "https://api.github.com";
const EXPECTED_ARCHIVE_ENTRY = "db/ogn.db";
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_DATABASE_BYTES = 256 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_API_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 1_000_000;
const MIN_REASONABLE_ROWS = 101;
const FUTURE_SKEW_MS = 5 * 60_000;
const REQUIRED_COLUMNS = ["type", "id", "acmodel", "acreg", "accn", "track", "ident", "actype"];
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SOURCE_RUN_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function reject(message) {
  throw new Error(message);
}

function positiveInteger(value, label) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) reject(`${label} is invalid`);
  return number;
}

function boundedAgeHours(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 24 * 365) reject("OGN_SOFTRF_UPDATE_MAX_AGE_HOURS is invalid");
  return number;
}

function readMaxAgeHours(environment) {
  const configured = environment.OGN_SOFTRF_UPDATE_MAX_AGE_HOURS ?? environment.OGN_SOFTRF_DDB_MAX_AGE_HOURS;
  return configured === undefined || String(configured).trim() === "" ? DEFAULT_MAX_AGE_HOURS : boundedAgeHours(configured);
}

function isEnabled(environment) {
  return environment.OGN_SOFTRF_UPDATE_ENABLED?.trim().toLowerCase() !== "false";
}

function trustedUtcTimestamp(value, label) {
  if (typeof value !== "string" || !ISO_UTC_TIMESTAMP.test(value)) reject(`${label} is missing or not a UTC timestamp`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) reject(`${label} is invalid`);
  return timestamp;
}

function asJsonObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject(`${label} is invalid`);
  return value;
}

function responseError(response, label) {
  return new Error(`${label}: HTTP ${response.status}`);
}

async function readBoundedBytes(response, maxBytes, label) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) reject(`${label} exceeds size limit`);
    return Buffer.from(bytes);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maxBytes) reject(`${label} exceeds size limit`);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

async function fetchJson(url, fetcher, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { headers, signal: controller.signal, redirect: "follow" });
    if (!response.ok) throw responseError(response, "GitHub API request failed");
    const body = await readBoundedBytes(response, MAX_API_BYTES, "GitHub API response");
    try {
      return asJsonObject(JSON.parse(body.toString("utf8")), "GitHub API response");
    } catch (error) {
      if (error instanceof SyntaxError) reject("GitHub API returned invalid JSON");
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function fetchArchive(url, fetcher, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The URL is constructed from the fixed GitHub API host. If GitHub redirects
    // to signed object storage, do not forward Authorization to that host.
    let response = await fetcher(url, { headers, signal: controller.signal, redirect: "manual" });
    for (let redirects = 0; response.status >= 300 && response.status < 400; redirects += 1) {
      if (redirects >= 3) reject("artifact download redirected too many times");
      const location = response.headers.get("location");
      if (!location) reject("artifact download redirect has no location");
      let redirectedUrl;
      try {
        redirectedUrl = new URL(location, url);
      } catch {
        reject("artifact download redirect URL is invalid");
      }
      if (redirectedUrl.protocol !== "https:") reject("artifact download redirect is not HTTPS");
      response = await fetcher(redirectedUrl.toString(), { headers: { "User-Agent": headers["User-Agent"], Accept: "application/zip" }, signal: controller.signal, redirect: "manual" });
      url = redirectedUrl.toString();
    }
    if (!response.ok) throw responseError(response, "SoftRF artifact download failed");
    return readBoundedBytes(response, MAX_ARCHIVE_BYTES, "SoftRF artifact");
  } finally {
    clearTimeout(timer);
  }
}

function apiHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "AirRadar-soft-rf-updater",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function artifactDownloadUrl(artifactId) {
  return `${GITHUB_API}/repos/${SOFRF_REPOSITORY}/actions/artifacts/${artifactId}/zip`;
}

function parseSuccessfulRun(payload) {
  const runs = payload.workflow_runs;
  if (!Array.isArray(runs)) reject("GitHub workflow runs response is invalid");
  const run = runs.find((candidate) => candidate && candidate.status === "completed" && candidate.conclusion === "success" && candidate.path === `.github/workflows/${SOFRF_WORKFLOW}`);
  if (!run) reject("no successful SoftRF aircraft database workflow run found");
  const id = positiveInteger(run.id, "workflow run ID");
  return { id: String(id), numericId: id };
}

function parseArtifact(payload) {
  const artifacts = payload.artifacts;
  if (!Array.isArray(artifacts)) reject("GitHub artifacts response is invalid");
  const matches = artifacts.filter((artifact) => artifact && artifact.name === SOFRF_ARTIFACT_NAME && artifact.expired === false);
  if (matches.length !== 1) reject(matches.length === 0 ? "successful run has no unexpired Data artifact" : "successful run has multiple Data artifacts");
  const artifact = matches[0];
  const id = positiveInteger(artifact.id, "artifact ID");
  const createdAt = trustedUtcTimestamp(artifact.created_at, "artifact created_at");
  return { id, createdAt, createdAtIso: artifact.created_at };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  reject("artifact is not a valid ZIP archive");
}

function readZipEntries(archive) {
  if (archive.length < 22) reject("artifact is not a valid ZIP archive");
  const end = findEndOfCentralDirectory(archive);
  if (archive.readUInt16LE(end + 4) !== 0 || archive.readUInt16LE(end + 6) !== 0) reject("multi-disk ZIP archives are not supported");
  const entriesCount = archive.readUInt16LE(end + 10);
  const centralSize = archive.readUInt32LE(end + 12);
  const centralOffset = archive.readUInt32LE(end + 16);
  if (entriesCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) reject("ZIP64 archives are not supported");
  if (centralOffset + centralSize > end) reject("ZIP central directory is invalid");

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entriesCount; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) reject("ZIP central directory is invalid");
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const crc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (offset + recordLength > archive.length) reject("ZIP central directory entry is truncated");
    if ((flags & 1) !== 0) reject("encrypted ZIP entries are not supported");
    if (method !== 0 && method !== 8) reject("ZIP compression method is not supported");
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString((flags & 0x800) !== 0 ? "utf8" : "latin1");
    const pathParts = name.split("/");
    if (!name || name.includes("\\") || name.startsWith("/") || pathParts.some((part, partIndex) => part === ".." || (part === "" && partIndex !== pathParts.length - 1))) reject("ZIP entry path is invalid");
    const mode = (archive.readUInt32LE(offset + 38) >>> 16) & 0xffff;
    if ((mode & 0xf000) === 0xa000) reject("ZIP symlinks are not supported");
    if (uncompressedSize > MAX_DATABASE_BYTES || compressedSize > MAX_ARCHIVE_BYTES) reject("ZIP entry exceeds size limit");
    entries.push({ name, crc, compressedSize, uncompressedSize, localOffset, method });
    offset += recordLength;
  }
  if (offset !== centralOffset + centralSize) reject("ZIP central directory size is invalid");
  return entries;
}

function extractExpectedDatabase(archive) {
  const entries = readZipEntries(archive);
  const matches = entries.filter((entry) => entry.name === EXPECTED_ARCHIVE_ENTRY);
  if (matches.length !== 1) reject(matches.length === 0 ? `ZIP is missing ${EXPECTED_ARCHIVE_ENTRY}` : `ZIP contains duplicate ${EXPECTED_ARCHIVE_ENTRY}`);
  const entry = matches[0];
  if (entry.name.endsWith("/") || entry.uncompressedSize <= 0 || entry.uncompressedSize > MAX_DATABASE_BYTES) reject("SoftRF database size is invalid");
  if (entry.localOffset + 30 > archive.length || archive.readUInt32LE(entry.localOffset) !== 0x04034b50) reject("ZIP local entry is invalid");
  const localNameLength = archive.readUInt16LE(entry.localOffset + 26);
  const localExtraLength = archive.readUInt16LE(entry.localOffset + 28);
  const localName = archive.subarray(entry.localOffset + 30, entry.localOffset + 30 + localNameLength).toString("utf8");
  if (localName !== entry.name) reject("ZIP local entry name does not match central directory");
  const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataOffset < 0 || dataEnd > archive.length) reject("ZIP entry is truncated");
  const compressed = archive.subarray(dataOffset, dataEnd);
  let database;
  try {
    database = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_DATABASE_BYTES });
  } catch {
    reject("ZIP entry decompression failed");
  }
  if (database.byteLength !== entry.uncompressedSize || crc32(database) !== entry.crc) reject("ZIP entry checksum is invalid");
  return database;
}

function validText(value, maximum) {
  return typeof value === "string" && value.length <= maximum && !/[\0\r\n]/.test(value);
}

function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function validateSqlite(databasePath) {
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    const columns = database.prepare("PRAGMA table_info(devices)").all();
    if (!Array.isArray(columns) || !columns.length || !REQUIRED_COLUMNS.every((name) => columns.some((column) => column.name === name))) reject("SQLite devices schema is invalid");
    const integrity = database.prepare("PRAGMA integrity_check").get();
    if (integrity?.integrity_check !== "ok") reject("SQLite integrity check failed");
    const countRow = database.prepare("SELECT COUNT(*) AS count FROM devices").get();
    const recordCount = integer(countRow?.count);
    if (recordCount === null || recordCount < MIN_REASONABLE_ROWS || recordCount > MAX_ROWS) reject("SoftRF database row count is invalid");
    const rows = database.prepare("SELECT type, id, acmodel, acreg, accn, track, ident, actype FROM devices").all();
    if (rows.length !== recordCount) reject("SQLite row count changed during validation");
    for (const row of rows) {
      if (![1, 2, 3].includes(row.type) || integer(row.id) === null || row.id < 0 || row.id > 0xffffff || ![0, 1].includes(row.track) || ![0, 1].includes(row.ident)) reject("SoftRF database row is invalid");
      if (row.acmodel !== null && row.acmodel !== undefined && !validText(row.acmodel, 160)) reject("SoftRF database row is invalid");
      if (row.acreg !== null && row.acreg !== undefined && !validText(row.acreg, 40)) reject("SoftRF database row is invalid");
      if (row.accn !== null && row.accn !== undefined && !validText(row.accn, 24)) reject("SoftRF database row is invalid");
    }
    return { recordCount };
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("SoftRF database") || error.message.startsWith("SQLite"))) throw error;
    reject("SQLite database cannot be opened read-only");
  } finally {
    database?.close();
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readInstalledIdentity(databasePath) {
  const metadataPath = `${databasePath}.meta.json`;
  try {
    const [databaseBytes, metadataBytes] = await Promise.all([readFile(databasePath), readFile(metadataPath)]);
    if (metadataBytes.byteLength > MAX_METADATA_BYTES) return null;
    const metadata = asJsonObject(JSON.parse(metadataBytes.toString("utf8")), "installed sidecar");
    if (metadata.source !== "SoftRF" || typeof metadata.sourceRunId !== "string" || !SOURCE_RUN_ID.test(metadata.sourceRunId) || typeof metadata.sha256 !== "string" || !SHA256_HEX.test(metadata.sha256)) return null;
    if (typeof metadata.generatedAt !== "string" || !ISO_UTC_TIMESTAMP.test(metadata.generatedAt) || !Number.isFinite(Date.parse(metadata.generatedAt))) return null;
    if (sha256(databaseBytes) !== metadata.sha256) return null;
    return { sourceRunId: metadata.sourceRunId, sha256: metadata.sha256 };
  } catch {
    return null;
  }
}

async function writeSyncedFile(path, bytes) {
  const handle = await open(path, "w", 0o640);
  try {
    await handle.writeFile(bytes);
    await handle.chmod(0o640);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeTemporaryDirectory(directory) {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    // A failed cleanup cannot make an invalid candidate active.
  }
}

async function installAtomically(databasePath, databaseBytes, metadata) {
  const targetDirectory = dirname(databasePath);
  await mkdir(targetDirectory, { recursive: true, mode: 0o750 });
  await chmod(targetDirectory, 0o750);
  const updateDirectory = await mkdtemp(join(targetDirectory, ".update-"));
  const databaseNewPath = join(updateDirectory, "ogn.db.new");
  const metadataNewPath = join(updateDirectory, "ogn.db.meta.json.new");
  const databaseTarget = databasePath;
  const metadataTarget = `${databasePath}.meta.json`;
  try {
    await writeSyncedFile(databaseNewPath, databaseBytes);
    await writeSyncedFile(metadataNewPath, `${JSON.stringify(metadata)}\n`);
    // Both renames are on the target filesystem. During the short mixed state
    // the loader sees a SHA mismatch and keeps its previous in-memory snapshot.
    await rename(databaseNewPath, databaseTarget);
    await rename(metadataNewPath, metadataTarget);
    await chmod(databaseTarget, 0o640);
    await chmod(metadataTarget, 0o640);
  } finally {
    await removeTemporaryDirectory(updateDirectory);
  }
}

export async function updateSoftRf(options = {}) {
  const environment = options.environment ?? process.env;
  if (!isEnabled(environment)) {
    reject("updater disabled");
  }
  const databasePath = options.databasePath ?? (environment.OGN_SOFTRF_DDB_PATH?.trim() || DEFAULT_DATABASE_PATH);
  const maxAgeHours = options.maxAgeHours ?? readMaxAgeHours(environment);
  const now = options.now ?? Date.now;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const token = (options.token ?? environment.OGN_SOFTRF_GITHUB_TOKEN ?? "").trim();
  const headers = apiHeaders(token);

  console.log("SoftRF update: checking latest successful artifact");
  const runsPayload = await fetchJson(`${GITHUB_API}/repos/${SOFRF_REPOSITORY}/actions/workflows/${SOFRF_WORKFLOW}/runs?status=success&per_page=20`, fetcher, headers, timeoutMs);
  const run = parseSuccessfulRun(runsPayload);
  const artifactsPayload = await fetchJson(`${GITHUB_API}/repos/${SOFRF_REPOSITORY}/actions/runs/${run.numericId}/artifacts?per_page=100`, fetcher, headers, timeoutMs);
  const artifact = parseArtifact(artifactsPayload);
  const age = now() - artifact.createdAt;
  if (age < -FUTURE_SKEW_MS) reject("artifact created_at is too far in the future");
  if (age > maxAgeHours * 60 * 60_000) reject("artifact is older than configured TTL");
  console.log(`SoftRF update: run=${run.id} artifact created=${artifact.createdAtIso}`);

  const installed = await readInstalledIdentity(databasePath);
  if (installed?.sourceRunId === run.id) {
    console.log(`SoftRF update: same run/hash already installed (${installed.sha256})`);
    return { installed: false, skipped: true, runId: run.id, sha256: installed.sha256 };
  }

  const archive = await fetchArchive(artifactDownloadUrl(artifact.id), fetcher, headers, timeoutMs);
  console.log(`SoftRF update: downloaded ${archive.byteLength} bytes`);
  const databaseBytes = extractExpectedDatabase(archive);
  await mkdir(dirname(databasePath), { recursive: true, mode: 0o750 });
  const temporaryDirectory = await mkdtemp(join(dirname(databasePath), ".validate-"));
  const temporaryDatabasePath = join(temporaryDirectory, "ogn.db");
  try {
    await writeFile(temporaryDatabasePath, databaseBytes, { mode: 0o640 });
    const validation = validateSqlite(temporaryDatabasePath);
    const hash = sha256(databaseBytes);
    const metadata = { generatedAt: artifact.createdAtIso, source: "SoftRF", sourceRunId: run.id, sha256: hash };
    console.log(`SoftRF update: validation OK, devices=${validation.recordCount}`);
    await installAtomically(databasePath, databaseBytes, metadata);
    console.log(`SoftRF update: installed sha256=${hash}`);
    return { installed: true, runId: run.id, sha256: hash, recordCount: validation.recordCount };
  } finally {
    await removeTemporaryDirectory(temporaryDirectory);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateSoftRf().catch((error) => {
    console.error(`SoftRF update rejected: ${error instanceof Error ? error.message : "unexpected error"}`);
    process.exitCode = 1;
  });
}
