import { DatabaseSync } from "node:sqlite";
import { statSync } from "node:fs";
import type { OgnDdbEntry, OgnDdbResolution } from "@/lib/ogn/types";

export const DEFAULT_OGN_SOFTRF_DDB_PATH = "/var/lib/airradar/ogn/softrf/ogn.db";
export const DEFAULT_OGN_SOFTRF_DDB_MAX_AGE_HOURS = 168;

const MAX_SOFTRF_BYTES = 256 * 1024 * 1024;
const MAX_SOFTRF_ROWS = 1_000_000;
const MIN_REASONABLE_SOFTRF_ROWS = 101;
const FUTURE_SKEW_MS = 5 * 60_000;
const DEVICE_TYPES = new Set([1, 2, 3]);
const REQUIRED_COLUMNS = new Set(["type", "id", "acmodel", "acreg", "accn", "track", "ident", "actype"]);

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

/**
 * Read-only, fail-closed support for SoftRF's generated db/ogn.db.
 * The file is a whitelist only: rows are indexed only when track=1 and
 * ident=1, and no descriptive fields are imported into public OGN state.
 */
export class SoftRfDdb {
  private readonly enabled: boolean;
  private readonly path: string;
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  private active: SoftRfSnapshot | null = null;
  private observedFileSignature: string | null = null;
  private hasObservedFile = false;
  private lastLoadAt: number | null = null;
  private lastLoadError: string | null = null;

  constructor(options: SoftRfDdbOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.path = options.path ?? DEFAULT_OGN_SOFTRF_DDB_PATH;
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
      return true;
    } catch (error) {
      this.lastLoadError = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "INVALID_SNAPSHOT";
      console.warn(`[ogn-ddb] SoftRF snapshot unavailable (${this.lastLoadError})`);
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
    const snapshotAt = Math.trunc(stat.mtimeMs);
    const age = this.now() - snapshotAt;
    if (!Number.isFinite(snapshotAt) || age < -FUTURE_SKEW_MS || age > this.maxAgeMs) throw new Error("SNAPSHOT_EXPIRED");

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

      const rows = database.prepare("SELECT type, id, acmodel, acreg, accn, track, ident, actype FROM devices").all() as Array<Record<string, unknown>>;
      if (rows.length !== recordCount) throw new Error("COUNT_CHANGED");
      const entries = new Map<string, OgnDdbEntry>();
      for (const row of rows) {
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
      return { entries, recordCount, snapshotAt };
    } finally {
      database.close();
    }
  }

  private fileSignature(): string {
    try {
      const stat = statSync(this.path);
      return stat.isFile() ? `${Math.trunc(stat.mtimeMs)}:${stat.size}` : "not-file";
    } catch {
      return "missing";
    }
  }
}
