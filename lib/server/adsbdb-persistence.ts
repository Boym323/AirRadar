import { closeSync, openSync, readSync, statSync } from "node:fs";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { AircraftMetadata, FlightRoute } from "@/lib/aircraft/types";

export type AdsbDbCacheKind = "metadata" | "route";

export interface AdsbDbCacheEntry<T> {
  key: string;
  value: T;
  fetchedAt: string;
  freshUntil: string;
}

export interface AdsbDbPersistenceDiagnostics {
  enabled: boolean;
  cacheFile: string;
  loadedFromDisk: boolean;
  loadedMetadataEntries: number;
  loadedRouteEntries: number;
  rejectedEntries: number;
  lastLoadAt: string | null;
  lastLoadError: string | null;
  dirty: boolean;
  lastSaveAt: string | null;
  lastSaveError: string | null;
  lastSaveEntries: number;
  fileSizeBytes: number | null;
  writes: number;
}

export interface AdsbDbPersistenceOptions {
  cacheFile: string;
  metadataTtlMs: number;
  routeTtlMs: number;
  metadataMaxStaleMs: number;
  routeMaxStaleMs: number;
  metadataMaxEntries: number;
  routeMaxEntries: number;
  maxBytes?: number;
  now?: () => number;
}

interface StoredAdsbDbFile {
  schemaVersion: 1;
  savedAt: string;
  metadata: AdsbDbCacheEntry<AircraftMetadata>[];
  routes: AdsbDbCacheEntry<FlightRoute>[];
}

interface RuntimeEntry<T> extends AdsbDbCacheEntry<T> {
  fetchedAtMs: number;
  freshUntilMs: number;
}

export type AdsbDbCacheLookup<T> = {
  value: T;
  fetchedAtMs: number;
  fresh: boolean;
} | null;

const SCHEMA_VERSION = 1;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_ALLOWED_BYTES = 16 * 1024 * 1024;
const MAX_ALLOWED_ENTRIES = 10_000;
const FUTURE_SKEW_MS = 0;
const DEFAULT_DEBOUNCE_MS = 3_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

function nullableStringValue(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null;
  return stringValue(value, maxLength) ?? undefined;
}

function validTimestamp(value: unknown, now: number): number | null {
  const serialized = stringValue(value, 64);
  if (!serialized) return null;
  const timestamp = Date.parse(serialized);
  if (!Number.isFinite(timestamp) || timestamp > now + FUTURE_SKEW_MS) return null;
  return timestamp;
}

function validKey(kind: AdsbDbCacheKind, value: unknown): value is string {
  if (typeof value !== "string" || value.length > 160) return false;
  if (kind === "metadata") return value.startsWith("aircraft-metadata:") && /^[A-Za-z0-9:_-]+$/.test(value);
  return value.startsWith("flight-route:") && /^[A-Za-z0-9:_-]+$/.test(value);
}

function validAirport(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return nullableStringValue(value.icaoCode, 8) !== undefined
    && nullableStringValue(value.iataCode, 8) !== undefined
    && stringValue(value.name, 240) !== null
    && nullableStringValue(value.city, 160) !== undefined
    && nullableStringValue(value.country, 160) !== undefined
    && typeof value.latitude === "number" && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
    && typeof value.longitude === "number" && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

function validMetadata(value: unknown): value is AircraftMetadata {
  if (!isRecord(value)) return false;
  const requiredNullable = [
    "registration", "registrationCountry", "registrationCountryCode", "aircraftType",
    "icaoTypeCode", "aircraftDescription", "operator", "manufacturer",
  ];
  if (requiredNullable.some((key) => nullableStringValue(value[key], 512) === undefined)) return false;
  if (value.flags !== undefined && nullableStringValue(value.flags, 256) === undefined) return false;
  if (value.year !== undefined && nullableStringValue(value.year, 32) === undefined) return false;
  return stringValue(value.source, 64) !== null && stringValue(value.retrievedAt, 64) !== null;
}

function validRoute(value: unknown): value is FlightRoute {
  if (!isRecord(value)) return false;
  return stringValue(value.callsign, 32) !== null
    && nullableStringValue(value.airline, 256) !== undefined
    && nullableStringValue(value.airlineIcao, 16) !== undefined
    && nullableStringValue(value.airlineIata, 16) !== undefined
    && nullableStringValue(value.origin, 16) !== undefined
    && nullableStringValue(value.destination, 16) !== undefined
    && validAirport(value.originAirport)
    && validAirport(value.destinationAirport)
    && stringValue(value.source, 64) !== null
    && stringValue(value.retrievedAt, 64) !== null;
}

function validateEntry<T>(
  kind: AdsbDbCacheKind,
  candidate: unknown,
  now: number,
  maxStaleMs: number,
): RuntimeEntry<T> | null {
  if (!isRecord(candidate) || !validKey(kind, candidate.key)) return null;
  const fetchedAtMs = validTimestamp(candidate.fetchedAt, now);
  const freshUntilMs = validTimestamp(candidate.freshUntil, now + maxStaleMs);
  if (fetchedAtMs === null || freshUntilMs === null || freshUntilMs < fetchedAtMs || now - fetchedAtMs > maxStaleMs) return null;
  const value = kind === "metadata" ? candidate.value : candidate.value;
  if (kind === "metadata" ? !validMetadata(value) : !validRoute(value)) return null;
  return {
    key: candidate.key,
    value: value as T,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    freshUntil: new Date(freshUntilMs).toISOString(),
    fetchedAtMs,
    freshUntilMs,
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
  }
  return "save_failed";
}

/**
 * Last-known-good ADSBDB values. Negative results and in-flight promises are
 * intentionally excluded. Disk errors are best effort and never fatal.
 */
export class AdsbDbPersistence {
  private readonly cacheFile: string;
  private readonly maxBytes: number;
  private readonly maxEntries: Record<AdsbDbCacheKind, number>;
  private readonly ttlMs: Record<AdsbDbCacheKind, number>;
  private readonly maxStaleMs: Record<AdsbDbCacheKind, number>;
  private readonly now: () => number;
  private readonly entries: Record<AdsbDbCacheKind, Map<string, RuntimeEntry<unknown>>> = {
    metadata: new Map(),
    route: new Map(),
  };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight: Promise<void> | null = null;
  private flushPromise: Promise<void> | null = null;
  private dirty = false;
  private loadedFromDisk = false;
  private loadedMetadataEntries = 0;
  private loadedRouteEntries = 0;
  private rejectedEntries = 0;
  private lastLoadAt: number | null = null;
  private lastLoadError: string | null = null;
  private lastSaveAt: number | null = null;
  private lastSaveError: string | null = null;
  private lastSaveEntries = 0;
  private fileSizeBytes: number | null = null;
  private persistenceWrites = 0;

  constructor(options: AdsbDbPersistenceOptions) {
    this.cacheFile = options.cacheFile;
    this.maxBytes = Math.min(MAX_ALLOWED_BYTES, Math.max(1_024, Math.trunc(options.maxBytes ?? DEFAULT_MAX_BYTES)));
    this.maxEntries = {
      metadata: Math.min(MAX_ALLOWED_ENTRIES, Math.max(1, Math.trunc(options.metadataMaxEntries))),
      route: Math.min(MAX_ALLOWED_ENTRIES, Math.max(1, Math.trunc(options.routeMaxEntries))),
    };
    this.ttlMs = { metadata: Math.max(1, options.metadataTtlMs), route: Math.max(1, options.routeTtlMs) };
    this.maxStaleMs = { metadata: Math.max(1, options.metadataMaxStaleMs), route: Math.max(1, options.routeMaxStaleMs) };
    this.now = options.now ?? Date.now;
    this.load();
  }

  get(kind: AdsbDbCacheKind, key: string, now = this.now()): AdsbDbCacheLookup<unknown> {
    const entry = this.entries[kind].get(key);
    if (!entry) return null;
    if (now - entry.fetchedAtMs > this.maxStaleMs[kind]) {
      this.entries[kind].delete(key);
      return null;
    }
    this.entries[kind].delete(key);
    this.entries[kind].set(key, entry);
    return { value: entry.value, fetchedAtMs: entry.fetchedAtMs, fresh: entry.freshUntilMs > now };
  }

  set(kind: AdsbDbCacheKind, key: string, value: AircraftMetadata | FlightRoute, now = this.now()): void {
    const fetchedAt = new Date(now).toISOString();
    const entry: RuntimeEntry<AircraftMetadata | FlightRoute> = {
      key,
      value,
      fetchedAt,
      freshUntil: new Date(now + this.ttlMs[kind]).toISOString(),
      fetchedAtMs: now,
      freshUntilMs: now + this.ttlMs[kind],
    };
    this.entries[kind].delete(key);
    this.entries[kind].set(key, entry);
    while (this.entries[kind].size > this.maxEntries[kind]) {
      const oldest = this.entries[kind].keys().next().value;
      if (oldest === undefined) break;
      this.entries[kind].delete(oldest);
    }
    this.dirty = true;
    this.scheduleSave();
  }

  delete(kind: AdsbDbCacheKind, key: string): void {
    if (this.entries[kind].delete(key)) {
      this.dirty = true;
      this.scheduleSave();
    }
  }

  entriesCount(kind: AdsbDbCacheKind): number {
    return this.entries[kind].size;
  }

  hydrateEntries(kind: AdsbDbCacheKind, now = this.now()): Array<{ key: string; value: unknown; freshUntilMs: number }> {
    return [...this.entries[kind].values()]
      .filter((entry) => entry.freshUntilMs > now && now - entry.fetchedAtMs <= this.maxStaleMs[kind])
      .map((entry) => ({ key: entry.key, value: entry.value, freshUntilMs: entry.freshUntilMs }));
  }

  getDiagnostics(): AdsbDbPersistenceDiagnostics {
    return {
      enabled: true,
      cacheFile: this.cacheFile,
      loadedFromDisk: this.loadedFromDisk,
      loadedMetadataEntries: this.loadedMetadataEntries,
      loadedRouteEntries: this.loadedRouteEntries,
      rejectedEntries: this.rejectedEntries,
      lastLoadAt: this.lastLoadAt === null ? null : new Date(this.lastLoadAt).toISOString(),
      lastLoadError: this.lastLoadError,
      dirty: this.dirty,
      lastSaveAt: this.lastSaveAt === null ? null : new Date(this.lastSaveAt).toISOString(),
      lastSaveError: this.lastSaveError,
      lastSaveEntries: this.lastSaveEntries,
      fileSizeBytes: this.fileSizeBytes,
      writes: this.persistenceWrites,
    };
  }

  async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    const promise = (async () => {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      if (this.saveInFlight) await this.saveInFlight;
      if (!this.dirty) return;
      this.dirty = false;
      const save = this.writeSnapshot();
      this.saveInFlight = save;
      await save;
      if (this.saveInFlight === save) this.saveInFlight = null;
      if (this.dirty && !this.saveTimer) this.scheduleSave();
    })();
    this.flushPromise = promise.finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }

  private load(): void {
    const now = this.now();
    this.lastLoadAt = now;
    let fileSize: number;
    try {
      fileSize = statSync(this.cacheFile).size;
      this.fileSizeBytes = fileSize;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") this.failLoad("stat_failed");
      return;
    }
    if (!Number.isSafeInteger(fileSize) || fileSize < 0 || fileSize > this.maxBytes) {
      this.failLoad("file_too_large");
      return;
    }
    let descriptor = -1;
    let serialized = "";
    try {
      descriptor = openSync(this.cacheFile, "r");
      const buffer = Buffer.alloc(this.maxBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const bytes = readSync(descriptor, buffer, total, buffer.length - total, null);
        if (bytes === 0) break;
        total += bytes;
      }
      if (total > this.maxBytes) {
        this.failLoad("file_too_large");
        return;
      }
      serialized = buffer.subarray(0, total).toString("utf8");
    } catch {
      this.failLoad("read_failed");
      return;
    } finally {
      if (descriptor !== -1) {
        try { closeSync(descriptor); } catch { this.failLoad("read_failed"); }
      }
    }
    if (!serialized.trim()) return;
    let payload: unknown;
    try {
      payload = JSON.parse(serialized) as unknown;
    } catch {
      this.failLoad("invalid_json");
      return;
    }
    if (!isRecord(payload) || payload.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.metadata) || !Array.isArray(payload.routes)) {
      this.failLoad("invalid_structure");
      return;
    }
    if (payload.metadata.length > this.maxEntries.metadata || payload.routes.length > this.maxEntries.route) {
      this.rejectedEntries = payload.metadata.length + payload.routes.length;
      this.failLoad("entry_cap_exceeded");
      return;
    }
    this.loadEntries("metadata", payload.metadata, now, this.maxStaleMs.metadata);
    this.loadEntries("route", payload.routes, now, this.maxStaleMs.route);
    this.loadedFromDisk = true;
    if (this.rejectedEntries > 0) this.failLoad("entries_rejected");
  }

  private failLoad(code: string): void {
    this.lastLoadError = code;
    console.warn(`[adsbdb] persistent cache ignored: ${code}`);
  }

  private loadEntries(kind: AdsbDbCacheKind, candidates: unknown[], now: number, maxStaleMs: number): void {
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const entry = validateEntry<unknown>(kind, candidate, now, maxStaleMs);
      if (!entry || seen.has(entry.key)) {
        this.rejectedEntries += 1;
        continue;
      }
      seen.add(entry.key);
      this.entries[kind].set(entry.key, entry);
      if (kind === "metadata") this.loadedMetadataEntries += 1;
      else this.loadedRouteEntries += 1;
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer || this.saveInFlight) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, DEFAULT_DEBOUNCE_MS);
  }

  private async writeSnapshot(): Promise<void> {
    const temporaryFile = `${this.cacheFile}.tmp`;
    try {
      const now = this.now();
      const metadata = [...this.entries.metadata.values()]
        .filter((entry) => now - entry.fetchedAtMs <= this.maxStaleMs.metadata)
        .map(({ key, value, fetchedAt, freshUntil }) => ({ key, value, fetchedAt, freshUntil }));
      const routes = [...this.entries.route.values()]
        .filter((entry) => now - entry.fetchedAtMs <= this.maxStaleMs.route)
        .map(({ key, value, fetchedAt, freshUntil }) => ({ key, value, fetchedAt, freshUntil }));
      const payload: StoredAdsbDbFile = {
        schemaVersion: SCHEMA_VERSION,
        savedAt: new Date(now).toISOString(),
        metadata: metadata as AdsbDbCacheEntry<AircraftMetadata>[],
        routes: routes as AdsbDbCacheEntry<FlightRoute>[],
      };
      const serialized = `${JSON.stringify(payload)}\n`;
      if (Buffer.byteLength(serialized, "utf8") > this.maxBytes) throw new Error("payload_too_large");
      await mkdir(path.dirname(this.cacheFile), { recursive: true, mode: 0o750 });
      const handle = await open(temporaryFile, "w", 0o600);
      try {
        await handle.writeFile(serialized, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await chmod(temporaryFile, 0o600);
      await rename(temporaryFile, this.cacheFile);
      this.fileSizeBytes = Buffer.byteLength(serialized, "utf8");
      this.lastSaveAt = this.now();
      this.lastSaveEntries = metadata.length + routes.length;
      this.lastSaveError = null;
      this.persistenceWrites += 1;
    } catch (error) {
      this.dirty = true;
      this.lastSaveError = error instanceof Error && error.message === "payload_too_large" ? "payload_too_large" : errorCode(error);
      try { await unlink(temporaryFile); } catch { /* best effort cleanup */ }
      console.warn(`[adsbdb] persistent cache write failed: ${this.lastSaveError}`);
    }
  }
}

export function disabledAdsbDbPersistence(cacheFile: string): AdsbDbPersistenceDiagnostics {
  return {
    enabled: false,
    cacheFile,
    loadedFromDisk: false,
    loadedMetadataEntries: 0,
    loadedRouteEntries: 0,
    rejectedEntries: 0,
    lastLoadAt: null,
    lastLoadError: null,
    dirty: false,
    lastSaveAt: null,
    lastSaveError: null,
    lastSaveEntries: 0,
    fileSizeBytes: null,
    writes: 0,
  };
}
