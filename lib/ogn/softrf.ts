import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import type { OgnDdbEntry, OgnDdbResolution } from "@/lib/ogn/types";

export const DEFAULT_OGN_SOFTRF_DDB_PATH = "/var/lib/airradar/ogn/softrf/ogn.db";
export const DEFAULT_OGN_SOFTRF_DDB_MAX_AGE_HOURS = 168;

const MAX_SOFTRF_BYTES = 256 * 1024 * 1024;
const MAX_SOFTRF_METADATA_BYTES = 64 * 1024;
const MAX_SOFTRF_ROWS = 1_000_000;
const MIN_REASONABLE_SOFTRF_ROWS = 101;
const FUTURE_SKEW_MS = 5 * 60_000;
const DEVICE_TYPES = new Set([1, 2, 3]);
const REQUIRED_COLUMNS = new Set(["type", "id", "acmodel", "acreg", "accn", "track", "ident", "actype"]);
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export interface SoftRfDdbOptions {
  enabled?: boolean;
  path?: string;
  maxAgeHours?: number;
  now?: () => number;
}

export interface SoftRfDdbDiagnostics {
  enabled: boolean;
  valid: boolean;
  recordCount: number;
  ageMs: number | null;
  lastLoadAt: string | null;
  lastLoadError: string | null;
}

interface SoftRfSnapshot {
  entries: Map<string, OgnDdbEntry>;
  recordCount: number;
  snapshotAt: number;
}

function normalizedKey(type: unknown, id: unknown): string | null {
  if (type !== "F" && type !== "I" && type !== "O") return null;
  if (typeof id !== "string" || !/^[A-F0-9]{6}$/i.test(id.trim())) return null;
  return `${type}:${id.trim().toUpperCase()}`;
}

function typeFromSoftRf(value: unknown): "F" | "I" | "O" | null {
  if (value === 1) return "I";
  if (value === 2) return "F";
  if (value === 3) return "O";
  return null;
}

function validText(value: unknown, maximum: number): boolean {
  return typeof value === "string" && value.length <= maximum && !/[\0\r\n]/.test(value);
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function sha256File(path: string): string {
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Read-only, fail-closed support for SoftRF's generated db/ogn.db.
 * The file is a whitelist only: rows are indexed only when track=1 and
 * ident=1, and no descriptive fields are imported into public OGN state.
 */
export class SoftRfDdb {
  private readonly enabled: boolean;
  private readonly path: string;
  private readonly metadataPath: string;
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  private active: SoftRfSnapshot | null = null;
  private observedFileSignature: string | null = null;
  private hasObservedFile = false;
  private lastLoadAt: number | null = null;
  private lastLoadError: string | null = null;
  private lastLoggedLoadError: string | null = null;

  constructor(options: SoftRfDdbOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.path = options.path ?? DEFAULT_OGN_SOFTRF_DDB_PATH;
    this.metadataPath = `${this.path}.meta.json`;
    const maxAgeHours = options.maxAgeHours ?? DEFAULT_OGN_SOFTRF_DDB_MAX_AGE_HOURS;
    this.maxAgeMs = Number.isFinite(maxAgeHours) ? Math.max(1, maxAgeHours * 60 * 60_000) : DEFAULT_OGN_SOFTRF_DDB_MAX_AGE_HOURS * 60 * 60_000;
    this.now = options.now ?? Date.now;
    if (this.enabled) this.reload();
  }

  /** Load a candidate first; a failed reload never clears the active snapshot. */
  reload(): boolean {
    if (!this.enabled) return false;
    this.observedFileSignature = this.fileSignature();
    this.hasObservedFile = true;
    this.lastLoadAt = this.now();
    try {
      const candidate = this.readSnapshot();
      this.active = candidate;
      this.lastLoadError = null;
      this.lastLoggedLoadError = null;
      return true;
    } catch (error) {
      this.lastLoadError = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "INVALID_SNAPSHOT";
      if (this.lastLoadError !== this.lastLoggedLoadError) {
        if (this.lastLoadError === "CHECKSUM_MISMATCH") {
          console.warn("[ogn-ddb] SoftRF snapshot rejected: checksum mismatch");
        } else {
          console.warn(`[ogn-ddb] SoftRF snapshot unavailable (${this.lastLoadError})`);
        }
        this.lastLoggedLoadError = this.lastLoadError;
      }
      return false;
    }
  }

  /** Cheap mtime/size check for a maintenance timer; never opens SQLite. */
  refreshIfChanged(): boolean {
    if (!this.enabled) return false;
    const signature = this.fileSignature();
    if (this.hasObservedFile && signature === this.observedFileSignature) return false;
    return this.reload();
  }

  getResolution(deviceType: "F" | "I" | "O", deviceId: string): OgnDdbResolution {
    const snapshot = this.active;
    if (!snapshot || !this.isFresh(snapshot)) return { status: "unresolved" };
    const key = normalizedKey(deviceType, deviceId.trim().toUpperCase());
    if (!key) return { status: "unresolved" };
    const entry = snapshot.entries.get(key);
    return entry
      ? { status: "found", entry, resolvedAt: snapshot.snapshotAt, expiresAt: snapshot.snapshotAt + this.maxAgeMs, source: "softrf" }
      : { status: "unresolved" };
  }

  getDiagnostics(): SoftRfDdbDiagnostics {
    const snapshot = this.active;
    const ageMs = snapshot ? Math.max(0, this.now() - snapshot.snapshotAt) : null;
    return {
      enabled: this.enabled,
      valid: snapshot !== null && this.isFresh(snapshot),
      recordCount: snapshot?.recordCount ?? 0,
      ageMs,
      lastLoadAt: this.lastLoadAt === null ? null : new Date(this.lastLoadAt).toISOString(),
      lastLoadError: this.lastLoadError,
    };
  }

  private isFresh(snapshot: SoftRfSnapshot): boolean {
    const age = this.now() - snapshot.snapshotAt;
    return age >= 0 && age <= this.maxAgeMs;
  }

  private readSnapshot(): SoftRfSnapshot {
    let stat;
    try {
      stat = statSync(this.path);
    } catch {
      throw new Error("FILE_UNAVAILABLE");
    }
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0 || stat.size > MAX_SOFTRF_BYTES) {
      throw new Error("FILE_INVALID");
    }
    const metadata = this.readMetadata();
    const snapshotAt = Date.parse(metadata.generatedAt);
    const age = this.now() - snapshotAt;
    if (!Number.isFinite(snapshotAt) || age < -FUTURE_SKEW_MS || age > this.maxAgeMs) throw new Error("SNAPSHOT_EXPIRED");
    const sha256 = sha256File(this.path);
    if (sha256 !== metadata.sha256) throw new Error("CHECKSUM_MISMATCH");

    const database = new DatabaseSync(this.path, { readOnly: true });
    try {
      const columns = database.prepare("PRAGMA table_info(devices)").all() as Array<{ name?: unknown }>;
      if (!columns.length || !columns.every((column) => typeof column.name === "string") || ![...REQUIRED_COLUMNS].every((name) => columns.some((column) => column.name === name))) {
        throw new Error("SCHEMA_INVALID");
      }
      const integrity = database.prepare("PRAGMA integrity_check").get() as Record<string, unknown> | undefined;
      if (integrity?.integrity_check !== "ok") throw new Error("SQLITE_INVALID");
      const countRow = database.prepare("SELECT COUNT(*) AS count FROM devices").get() as { count?: unknown } | undefined;
      const recordCount = integer(countRow?.count);
      if (recordCount === null || recordCount < MIN_REASONABLE_SOFTRF_ROWS || recordCount > MAX_SOFTRF_ROWS) throw new Error("COUNT_INVALID");

      const statement = database.prepare("SELECT type, id, acmodel, acreg, accn, track, ident, actype FROM devices");
      const entries = new Map<string, OgnDdbEntry>();
      let seenRows = 0;
      for (const row of statement.iterate() as Iterable<Record<string, unknown>>) {
        seenRows += 1;
        if (seenRows > recordCount) throw new Error("COUNT_CHANGED");
        const deviceType = typeFromSoftRf(row.type);
        const id = integer(row.id);
        if (!deviceType || id === null || id < 0 || id > 0xffffff || !DEVICE_TYPES.has(row.type as number) || (row.track !== 0 && row.track !== 1) || (row.ident !== 0 && row.ident !== 1)) {
          throw new Error("ROW_INVALID");
        }
        const deviceId = id.toString(16).padStart(6, "0").toUpperCase();
        const key = normalizedKey(deviceType, deviceId);
        if (!key || entries.has(key)) throw new Error("DUPLICATE_ID");
        // SoftRF is intentionally a privacy whitelist, not a DDB metadata
        // replacement. Only the two explicit privacy flags are carried over.
        if (row.track === 1 && row.ident === 1) {
          entries.set(key, {
            deviceType,
            deviceId,
            aircraftModel: null,
            registration: null,
            competitionNumber: null,
            tracked: "Y",
            identified: "Y",
            aircraftType: null,
          });
        }
        // Validate optional source text without depending on it for privacy.
        if (row.acmodel !== null && row.acmodel !== undefined && !validText(row.acmodel, 160)) throw new Error("ROW_INVALID");
        if (row.acreg !== null && row.acreg !== undefined && !validText(row.acreg, 40)) throw new Error("ROW_INVALID");
        if (row.accn !== null && row.accn !== undefined && !validText(row.accn, 24)) throw new Error("ROW_INVALID");
      }
      if (seenRows !== recordCount) throw new Error("COUNT_CHANGED");
      return { entries, recordCount, snapshotAt };
    } finally {
      database.close();
    }
  }

  private fileSignature(): string {
    try {
      const stat = statSync(this.path);
      const metadata = statSync(this.metadataPath);
      return stat.isFile() && metadata.isFile() ? `${Math.trunc(stat.mtimeMs)}:${stat.size}:${Math.trunc(metadata.mtimeMs)}:${metadata.size}` : "not-file";
    } catch {
      return "missing";
    }
  }

  private readMetadata(): { generatedAt: string; sha256: string } {
    let serialized: string;
    try {
      const metadataStat = statSync(this.metadataPath);
      if (!metadataStat.isFile() || !Number.isSafeInteger(metadataStat.size) || metadataStat.size <= 0 || metadataStat.size > MAX_SOFTRF_METADATA_BYTES) throw new Error("METADATA_INVALID");
      serialized = readFileSync(this.metadataPath, "utf8");
    } catch (error) {
      if (error instanceof Error && error.message === "METADATA_INVALID") throw error;
      throw new Error("METADATA_UNAVAILABLE");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error("METADATA_INVALID");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("METADATA_INVALID");
    const row = payload as Record<string, unknown>;
    if (row.source !== "SoftRF" || typeof row.sourceRunId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(row.sourceRunId) || typeof row.generatedAt !== "string" || !ISO_UTC_TIMESTAMP.test(row.generatedAt) || !Number.isFinite(Date.parse(row.generatedAt)) || typeof row.sha256 !== "string" || !SHA256_HEX.test(row.sha256)) {
      throw new Error("METADATA_INVALID");
    }
    return { generatedAt: row.generatedAt, sha256: row.sha256 };
  }
}
