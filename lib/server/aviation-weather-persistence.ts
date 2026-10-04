import { randomUUID } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

export type AviationWeatherProduct = "metar" | "taf" | "sigmet";

export interface PersistentWeatherEntry {
  product: AviationWeatherProduct;
  key: string;
  fetchedAt: string;
  value: unknown;
}

export interface AviationWeatherPersistenceDiagnostics {
  enabled: boolean;
  cacheFile: string;
  loadedFromDisk: boolean;
  diskEntriesLoaded: number;
  diskEntriesRejected: number;
  lastLoadAt: string | null;
  lastLoadError: string | null;
  dirty: boolean;
  lastSaveAt: string | null;
  lastSaveEntries: number;
  lastSaveError: string | null;
  writes: number;
  checkpointIntervalMs: number;
  checkpointMode: "periodic" | "shutdown-only";
  mutationGeneration: number;
  persistedGeneration: number;
  pendingMutations: number;
  firstDirtyAt: string | null;
  dirtyAgeMs: number | null;
  nextCheckpointAt: string | null;
  checkpointAttempts: number;
  checkpointSuccesses: number;
  checkpointFailures: number;
  periodicCheckpoints: number;
  gracefulCheckpoints: number;
  explicitCheckpoints: number;
  coalescedMutations: number;
  fileSizeBytes: number | null;
}

export interface ValidatedWeatherValue {
  valid: true;
  value: unknown;
}

export interface InvalidWeatherValue {
  valid: false;
}

export type WeatherValueValidator =
  (product: AviationWeatherProduct, key: string, value: unknown) => ValidatedWeatherValue | InvalidWeatherValue;

export interface AviationWeatherPersistenceOptions {
  cacheFile: string;
  maxAgeMs: number | Partial<Record<AviationWeatherProduct, number>>;
  maxEntries: number;
  maxBytes?: number;
  now?: () => number;
  validateValue: WeatherValueValidator;
  checkpointIntervalMs?: number;
  snapshotProvider?: () => PersistentWeatherEntry[];
}

export interface AviationWeatherCachePersistence {
  maxAgeMsFor(product: AviationWeatherProduct): number;
  load(): PersistentWeatherEntry[];
  schedule(entries: PersistentWeatherEntry[]): void;
  markDirty(): void;
  setSnapshotProvider(provider: () => PersistentWeatherEntry[]): void;
  getDiagnostics(): AviationWeatherPersistenceDiagnostics;
  flush(reason?: "periodic" | "graceful" | "explicit"): Promise<void>;
}

const PERSISTENCE_VERSION = 1;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_ALLOWED_BYTES = 16 * 1024 * 1024;
const MAX_ALLOWED_ENTRIES = 1_024;
const FUTURE_SKEW_MS = 5 * 60_000;
const DEFAULT_CHECKPOINT_INTERVAL_MS = 30 * 60_000;
const CHECKPOINT_RETRY_INITIAL_MS = 60_000;
const CHECKPOINT_RETRY_MAX_MS = 30 * 60_000;

interface PersistentWeatherFile {
  version: 1;
  savedAt: string;
  entries: PersistentWeatherEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value: unknown, now: number, maxAgeMs: number): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + FUTURE_SKEW_MS || now - timestamp > maxAgeMs) return null;
  return new Date(timestamp).toISOString();
}

function validProduct(value: unknown): value is AviationWeatherProduct {
  return value === "metar" || value === "taf" || value === "sigmet";
}

function validKey(product: AviationWeatherProduct, value: unknown): value is string {
  if (typeof value !== "string" || value.length > 16) return false;
  return product === "sigmet" ? value === "isigmet" || value === "airsigmet" : /^[A-Z]{4}$/.test(value);
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
  }
  return "save_failed";
}

/**
 * Last-known-good weather snapshots are optional state. A bad file or a disk
 * failure must never prevent the provider (or the application) from starting.
 */
export class AviationWeatherPersistence implements AviationWeatherCachePersistence {
  private readonly maxAgeMsByProduct: Record<AviationWeatherProduct, number>;
  private readonly cacheFile: string;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private readonly validateValue: WeatherValueValidator;
  private readonly checkpointIntervalMs: number;
  private snapshotProvider: (() => PersistentWeatherEntry[]) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight: Promise<void> | null = null;
  private flushPromise: Promise<void> | null = null;
  private pendingEntries: PersistentWeatherEntry[] = [];
  private dirty = false;
  private loadedFromDisk = false;
  private diskEntriesLoaded = 0;
  private diskEntriesRejected = 0;
  private lastLoadAt: number | null = null;
  private lastLoadError: string | null = null;
  private lastSaveAt: number | null = null;
  private lastSaveEntries = 0;
  private lastSaveError: string | null = null;
  private persistenceWrites = 0;
  private mutationGeneration = 0;
  private persistedGeneration = 0;
  private firstDirtyAt: number | null = null;
  private checkpointAttempts = 0;
  private checkpointSuccesses = 0;
  private checkpointFailures = 0;
  private periodicCheckpoints = 0;
  private gracefulCheckpoints = 0;
  private explicitCheckpoints = 0;
  private coalescedMutations = 0;
  private fileSizeBytes: number | null = null;
  private retryDelayMs = CHECKPOINT_RETRY_INITIAL_MS;

  constructor(options: AviationWeatherPersistenceOptions) {
    this.cacheFile = options.cacheFile;
    const configured = typeof options.maxAgeMs === "number" ? {
      metar: options.maxAgeMs, taf: options.maxAgeMs, sigmet: options.maxAgeMs,
    } : options.maxAgeMs;
    this.maxAgeMsByProduct = {
      metar: Math.max(1, configured.metar ?? 2 * 60 * 60_000),
      taf: Math.max(1, configured.taf ?? 24 * 60 * 60_000),
      sigmet: Math.max(1, configured.sigmet ?? 24 * 60 * 60_000),
    };
    this.maxEntries = Math.min(MAX_ALLOWED_ENTRIES, Math.max(1, Math.trunc(options.maxEntries)));
    this.maxBytes = Math.min(MAX_ALLOWED_BYTES, Math.max(1_024, Math.trunc(options.maxBytes ?? DEFAULT_MAX_BYTES)));
    this.now = options.now ?? Date.now;
    this.validateValue = options.validateValue;
    const checkpointIntervalMs = options.checkpointIntervalMs ?? DEFAULT_CHECKPOINT_INTERVAL_MS;
    this.checkpointIntervalMs = checkpointIntervalMs === 0
      ? 0
      : Math.min(24 * 60 * 60_000, Math.max(60_000, Math.trunc(checkpointIntervalMs)));
    this.snapshotProvider = options.snapshotProvider ?? null;
  }

  maxAgeMsFor(product: AviationWeatherProduct): number {
    return this.maxAgeMsByProduct[product];
  }

  load(): PersistentWeatherEntry[] {
    const now = this.now();
    this.lastLoadAt = now;
    let descriptor = -1;
    let serialized = "";
    try {
      descriptor = openSync(this.cacheFile, "r");
      const fileSize = fstatSync(descriptor).size;
      this.fileSizeBytes = fileSize;
      if (!Number.isSafeInteger(fileSize) || fileSize < 0 || fileSize > this.maxBytes) {
        this.lastLoadError = "file_too_large";
        return [];
      }
      const buffer = Buffer.alloc(this.maxBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const bytes = readSync(descriptor, buffer, total, buffer.length - total, null);
        if (bytes === 0) break;
        total += bytes;
      }
      if (total > this.maxBytes) {
        this.lastLoadError = "file_too_large";
        return [];
      }
      serialized = buffer.subarray(0, total).toString("utf8");
    } catch (error) {
      if (this.errorCode(error) !== "ENOENT") this.lastLoadError = "read_failed";
      return [];
    } finally {
      if (descriptor !== -1) {
        try { closeSync(descriptor); } catch { this.lastLoadError = "read_failed"; }
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(serialized) as unknown;
    } catch {
      this.lastLoadError = "invalid_json";
      return [];
    }
    if (!isRecord(payload) || payload.version !== PERSISTENCE_VERSION || !Array.isArray(payload.entries)) {
      this.lastLoadError = "invalid_structure";
      return [];
    }
    if (payload.entries.length > this.maxEntries) {
      this.diskEntriesRejected = payload.entries.length;
      this.lastLoadError = "entry_cap_exceeded";
      return [];
    }

    const entries: PersistentWeatherEntry[] = [];
    const seen = new Set<string>();
    for (const candidate of payload.entries) {
      if (!isRecord(candidate) || !validProduct(candidate.product) || !validKey(candidate.product, candidate.key)) {
        this.diskEntriesRejected += 1;
        continue;
      }
      const dedupeKey = `${candidate.product}:${candidate.key}`;
      if (seen.has(dedupeKey)) {
        this.diskEntriesRejected += 1;
        continue;
      }
      const fetchedAt = validTimestamp(candidate.fetchedAt, now, this.maxAgeMsFor(candidate.product));
      if (!fetchedAt) {
        this.diskEntriesRejected += 1;
        continue;
      }
      const validated = this.validateValue(candidate.product, candidate.key, candidate.value);
      if (!validated.valid) {
        this.diskEntriesRejected += 1;
        continue;
      }
      seen.add(dedupeKey);
      entries.push({ product: candidate.product, key: candidate.key, fetchedAt, value: validated.value });
      this.diskEntriesLoaded += 1;
    }
    this.loadedFromDisk = true;
    if (this.diskEntriesRejected > 0) this.lastLoadError = "entries_rejected";
    return entries;
  }

  schedule(entries: PersistentWeatherEntry[]): void {
    this.pendingEntries = entries.slice(0, this.maxEntries);
    this.setSnapshotProvider(() => this.pendingEntries);
    this.markDirty();
  }

  setSnapshotProvider(provider: () => PersistentWeatherEntry[]): void {
    this.snapshotProvider = provider;
  }

  markDirty(): void {
    this.mutationGeneration += 1;
    if (this.dirty) {
      this.coalescedMutations += 1;
      return;
    }
    this.dirty = true;
    this.firstDirtyAt = this.now();
    if (this.checkpointIntervalMs > 0) this.scheduleCheckpoint(this.checkpointIntervalMs);
  }

  getDiagnostics(): AviationWeatherPersistenceDiagnostics {
    return {
      enabled: true,
      cacheFile: this.cacheFile,
      loadedFromDisk: this.loadedFromDisk,
      diskEntriesLoaded: this.diskEntriesLoaded,
      diskEntriesRejected: this.diskEntriesRejected,
      lastLoadAt: this.lastLoadAt === null ? null : new Date(this.lastLoadAt).toISOString(),
      lastLoadError: this.lastLoadError,
      dirty: this.dirty,
      lastSaveAt: this.lastSaveAt === null ? null : new Date(this.lastSaveAt).toISOString(),
      lastSaveEntries: this.lastSaveEntries,
      lastSaveError: this.lastSaveError,
      writes: this.persistenceWrites,
      checkpointIntervalMs: this.checkpointIntervalMs,
      checkpointMode: this.checkpointIntervalMs === 0 ? "shutdown-only" : "periodic",
      mutationGeneration: this.mutationGeneration,
      persistedGeneration: this.persistedGeneration,
      pendingMutations: Math.max(0, this.mutationGeneration - this.persistedGeneration),
      firstDirtyAt: this.firstDirtyAt === null ? null : new Date(this.firstDirtyAt).toISOString(),
      dirtyAgeMs: this.firstDirtyAt === null ? null : Math.max(0, this.now() - this.firstDirtyAt),
      nextCheckpointAt: this.saveTimer && this.firstDirtyAt !== null && this.checkpointIntervalMs > 0
        ? new Date(this.firstDirtyAt + this.checkpointIntervalMs).toISOString() : null,
      checkpointAttempts: this.checkpointAttempts,
      checkpointSuccesses: this.checkpointSuccesses,
      checkpointFailures: this.checkpointFailures,
      periodicCheckpoints: this.periodicCheckpoints,
      gracefulCheckpoints: this.gracefulCheckpoints,
      explicitCheckpoints: this.explicitCheckpoints,
      coalescedMutations: this.coalescedMutations,
      fileSizeBytes: this.fileSizeBytes,
    };
  }

  async flush(reason: "periodic" | "graceful" | "explicit" = "explicit"): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    const promise = (async () => {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      if (this.saveInFlight) await this.saveInFlight;
      if (!this.dirty) return;
      const targetGeneration = this.mutationGeneration;
      const entries = (this.snapshotProvider?.() ?? this.pendingEntries).slice(0, this.maxEntries);
      this.dirty = false;
      this.checkpointAttempts += 1;
      const save = this.writeSnapshot(entries, targetGeneration, reason);
      this.saveInFlight = save;
      await save;
      if (this.saveInFlight === save) this.saveInFlight = null;
      if (this.dirty && !this.saveTimer && !this.retryTimer && this.checkpointIntervalMs > 0) {
        const deadline = this.firstDirtyAt === null ? this.now() + this.checkpointIntervalMs : this.firstDirtyAt + this.checkpointIntervalMs;
        this.scheduleCheckpoint(Math.max(0, deadline - this.now()));
      }
    })();
    this.flushPromise = promise.finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }

  private scheduleCheckpoint(delayMs: number): void {
    if (this.saveTimer || this.saveInFlight || this.checkpointIntervalMs === 0) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush("periodic");
    }, Math.max(0, delayMs));
  }

  private async writeSnapshot(entries: PersistentWeatherEntry[], targetGeneration: number, reason: "periodic" | "graceful" | "explicit"): Promise<void> {
    const temporaryFile = `${this.cacheFile}.tmp-${process.pid}-${randomUUID()}`;
    try {
      const now = this.now();
      const retainedEntries = entries.filter((entry) => validTimestamp(entry.fetchedAt, now, this.maxAgeMsFor(entry.product)) !== null);
      const payload: PersistentWeatherFile = { version: PERSISTENCE_VERSION, savedAt: new Date(now).toISOString(), entries: retainedEntries };
      const serialized = `${JSON.stringify(payload)}\n`;
      if (Buffer.byteLength(serialized, "utf8") > this.maxBytes) throw new Error("payload_too_large");
      await mkdir(path.dirname(this.cacheFile), { recursive: true, mode: 0o750 });
      const handle = await open(temporaryFile, "wx", 0o600);
      try {
        await handle.writeFile(serialized, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await chmod(temporaryFile, 0o600);
      await rename(temporaryFile, this.cacheFile);
      this.persistenceWrites += 1;
      this.checkpointSuccesses += 1;
      if (reason === "periodic") this.periodicCheckpoints += 1;
      if (reason === "graceful") this.gracefulCheckpoints += 1;
      if (reason === "explicit") this.explicitCheckpoints += 1;
      this.persistedGeneration = targetGeneration;
      if (this.mutationGeneration === targetGeneration) this.firstDirtyAt = null;
      this.retryDelayMs = CHECKPOINT_RETRY_INITIAL_MS;
      try { this.fileSizeBytes = statSync(this.cacheFile).size; } catch { this.fileSizeBytes = null; }
      this.lastSaveAt = this.now();
      this.lastSaveEntries = retainedEntries.length;
      this.lastSaveError = null;
    } catch (error) {
      this.dirty = true;
      this.checkpointFailures += 1;
      if (this.firstDirtyAt === null) this.firstDirtyAt = this.now();
      if (this.checkpointIntervalMs > 0 && !this.retryTimer) {
        const delay = this.retryDelayMs;
        this.retryDelayMs = Math.min(CHECKPOINT_RETRY_MAX_MS, this.retryDelayMs * 2);
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.flush("periodic");
        }, delay);
      }
      this.lastSaveError = error instanceof Error && error.message === "payload_too_large" ? "payload_too_large" : errorCode(error);
      try { await unlink(temporaryFile); } catch { /* best effort cleanup */ }
      console.warn(`[Aviation Weather] persistent cache save failed (${this.lastSaveError})`);
    }
  }

  private errorCode(error: unknown): string | null {
    if (!error || typeof error !== "object") return null;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : null;
  }
}
