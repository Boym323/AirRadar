import type { OgnDdbDiagnostics, OgnDdbEntry, OgnDdbResolution } from "@/lib/ogn/types";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const DEFAULT_OGN_DDB_URL = "https://ddb.glidernet.org/download/?j=1&t=1";
export const DEFAULT_OGN_DDB_FALLBACK_URL = "https://ddb.glidernet.org/download/?j=1";
export const DEFAULT_OGN_DDB_REFRESH_MS = 6 * 60 * 60_000;
export const DEFAULT_OGN_DDB_MAX_STALE_MS = 24 * 60 * 60_000;
export const DEFAULT_OGN_DDB_NEGATIVE_TTL_MS = 30 * 60_000;
export const DEFAULT_OGN_DDB_BATCH_SIZE = 50;
export const DEFAULT_OGN_DDB_BATCH_DELAY_MS = 1_000;
export const DEFAULT_OGN_DDB_MIN_REQUEST_INTERVAL_MS = 10_000;
export const DEFAULT_OGN_DDB_CACHE_MAX_ENTRIES = 10_000;
export const DEFAULT_OGN_DDB_FAILURE_RETRY_MS = 10 * 60_000;

const MAX_DDB_BYTES = 16 * 1024 * 1024;
const MAX_DDB_ENTRIES = 100_000;
const MAX_DDB_BATCH_SIZE = 100;
const MAX_DDB_CACHE_ENTRIES = 100_000;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60_000;
const DEVICE_ID_PATTERN = /^[A-F0-9]{6}$/;
const DEVICE_TYPES = new Set(["F", "I", "O"]);

export interface OgnDdbOptions {
  url?: string;
  refreshMs?: number;
  maxStaleMs?: number;
  negativeTtlMs?: number;
  batchSize?: number;
  batchDelayMs?: number;
  minRequestIntervalMs?: number;
  cacheMaxEntries?: number;
  maxPendingKeys?: number;
  requestTimeoutMs?: number;
  maxBytes?: number;
  maxEntries?: number;
  failureRetryMs?: number;
  fetcher?: typeof fetch;
  now?: () => number;
}

type DdbMode = "rich-json" | "base-json" | "targeted-rich-json" | "targeted-base-json";

interface DdbSnapshot {
  entries: OgnDdbEntry[];
  aircraftTypeAvailable: boolean;
}

interface CachedDdbResolution {
  status: "found" | "missing";
  entry?: OgnDdbEntry;
  resolvedAt: number;
}

class DdbLoadError extends Error {
  readonly httpStatus: number | null;
  readonly retryAfterMs: number | null;

  constructor(message: string, httpStatus: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = "DdbLoadError";
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
  }
}

export function parseDdbRetryAfter(value: string | null, now = Date.now(), maximumMs = MAX_RETRY_AFTER_MS): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
    const delayMs = seconds * 1_000;
    return Number.isSafeInteger(delayMs) && delayMs <= maximumMs ? delayMs : null;
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;
  const delayMs = timestamp - now;
  return delayMs >= 0 && delayMs <= maximumMs ? delayMs : null;
}

export function shouldTryDdbFallback(error: unknown): boolean {
  if (!(error instanceof DdbLoadError) || error.httpStatus === null || error.httpStatus === 429) return false;
  if (error.httpStatus >= 500 && error.httpStatus <= 599) return true;
  // Keep the existing compatibility policy for representation/server errors.
  return error.httpStatus === 200 || error.httpStatus === 400 || error.httpStatus === 404 || error.httpStatus === 406 || error.httpStatus === 415;
}

function optionalText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !/[\r\n]/.test(value)
    ? value.trim()
    : null;
}

function parseFlag(value: unknown): "Y" | "N" | null {
  return value === "Y" || value === "N" ? value : null;
}

function parseAircraftType(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6) return value;
  if (typeof value === "string" && /^[1-6]$/.test(value)) return Number(value);
  return null;
}

function parseEntry(value: unknown): OgnDdbEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const deviceType = row.device_type;
  const deviceId = typeof row.device_id === "string" ? row.device_id.trim().toUpperCase() : "";
  if ((deviceType !== "F" && deviceType !== "I" && deviceType !== "O") || !DEVICE_ID_PATTERN.test(deviceId)) return null;
  const tracked = parseFlag(row.tracked);
  const identified = parseFlag(row.identified);
  if (!tracked || !identified) return null;
  return {
    deviceType,
    deviceId,
    aircraftModel: optionalText(row.aircraft_model, 160),
    registration: optionalText(row.registration, 40),
    competitionNumber: optionalText(row.cn, 24),
    tracked,
    identified,
    aircraftType: parseAircraftType(row.aircraft_type),
  };
}

function asBytes(value: ArrayBuffer): Uint8Array {
  return new Uint8Array(value);
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("DDB response exceeded configured byte limit");
  if (!response.body) {
    const value = await response.arrayBuffer();
    if (value.byteLength > maxBytes) throw new Error("DDB response exceeded configured byte limit");
    return new TextDecoder().decode(asBytes(value));
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new Error("DDB response exceeded configured byte limit");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(result);
}

export function ddbKey(deviceType: string, deviceId: string): string {
  return `${deviceType.toUpperCase()}:${deviceId.toUpperCase()}`;
}

export function ddbDeviceTypeForAddressType(addressTypeCode: number): "F" | "I" | "O" | null {
  if (addressTypeCode === 1) return "I";
  if (addressTypeCode === 2) return "F";
  if (addressTypeCode === 3) return "O";
  return null;
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function isDeviceType(value: string): value is "F" | "I" | "O" {
  return DEVICE_TYPES.has(value);
}

function isResolutionEntry(value: CachedDdbResolution | undefined): value is CachedDdbResolution & { status: "found"; entry: OgnDdbEntry } {
  return value?.status === "found" && value.entry !== undefined;
}

function sanitizeDdbUrl(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if ((url.protocol !== "https:" && url.protocol !== "http:") || host !== "ddb.glidernet.org" || url.port || url.pathname !== "/download/" || url.username || url.password) return DEFAULT_OGN_DDB_URL;
    url.hash = "";
    return url.toString();
  } catch {
    return DEFAULT_OGN_DDB_URL;
  }
}

export class OgnDdb {
  private readonly url: string;
  private readonly refreshMs: number;
  private readonly maxStaleMs: number;
  private readonly negativeTtlMs: number;
  private readonly batchSize: number;
  private readonly batchDelayMs: number;
  private readonly minRequestIntervalMs: number;
  private readonly cacheMaxEntries: number;
  private readonly maxPendingKeys: number;
  private readonly requestTimeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly failureRetryMs: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly endpoint: string;
  private readonly cache = new Map<string, CachedDdbResolution>();
  private readonly pendingQueue: string[] = [];
  private readonly pendingKeys = new Set<string>();
  private readonly inFlightKeys = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private currentMode: DdbMode | null = null;
  private lastAttemptAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private bulkCompleteAt: number | null = null;
  private lastHttpStatus: number | null = null;
  private lastRequestAt: number | null = null;
  private lastBatchSize: number | null = null;
  private failures = 0;
  private fallbackCount = 0;
  private fallbackUsed = false;
  private rateLimited = false;
  private retryAfterMs: number | null = null;
  private nextRetryAt: number | null = null;
  private aircraftTypeAvailable = false;
  private requests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private batchCount = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private evictions = 0;
  private unexpectedRecords = 0;
  private conflictingRecords = 0;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private activeController: AbortController | null = null;
  private status: OgnDdbDiagnostics["status"] = "offline";
  private strategy: OgnDdbDiagnostics["strategy"] = "targeted";
  private representation: "rich" | "base" | null = null;

  constructor(options: OgnDdbOptions = {}) {
    this.url = sanitizeDdbUrl(options.url ?? DEFAULT_OGN_DDB_URL);
    // Production values are bounded by getOgnConfig(); keeping constructor
    // bounds small also makes deterministic resolver tests practical.
    this.refreshMs = Math.max(1, options.refreshMs ?? DEFAULT_OGN_DDB_REFRESH_MS);
    this.maxStaleMs = Math.max(this.refreshMs, options.maxStaleMs ?? DEFAULT_OGN_DDB_MAX_STALE_MS);
    this.negativeTtlMs = Math.max(1, options.negativeTtlMs ?? DEFAULT_OGN_DDB_NEGATIVE_TTL_MS);
    this.batchSize = boundedInteger(options.batchSize ?? DEFAULT_OGN_DDB_BATCH_SIZE, 1, MAX_DDB_BATCH_SIZE);
    this.batchDelayMs = boundedInteger(options.batchDelayMs ?? DEFAULT_OGN_DDB_BATCH_DELAY_MS, 0, 60_000);
    this.minRequestIntervalMs = boundedInteger(options.minRequestIntervalMs ?? DEFAULT_OGN_DDB_MIN_REQUEST_INTERVAL_MS, 0, 60 * 60_000);
    this.cacheMaxEntries = boundedInteger(options.cacheMaxEntries ?? DEFAULT_OGN_DDB_CACHE_MAX_ENTRIES, 1, MAX_DDB_CACHE_ENTRIES);
    this.maxPendingKeys = boundedInteger(options.maxPendingKeys ?? this.cacheMaxEntries, 1, MAX_DDB_CACHE_ENTRIES);
    this.requestTimeoutMs = Math.max(500, options.requestTimeoutMs ?? 10_000);
    this.maxBytes = Math.min(MAX_DDB_BYTES, Math.max(1_024, options.maxBytes ?? MAX_DDB_BYTES));
    this.maxEntries = Math.min(MAX_DDB_ENTRIES, Math.max(1, options.maxEntries ?? MAX_DDB_ENTRIES));
    this.failureRetryMs = boundedInteger(options.failureRetryMs ?? DEFAULT_OGN_DDB_FAILURE_RETRY_MS, 0, 60 * 60_000);
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.endpoint = this.endpointFromUrl(this.url);
  }

  /** Start the resolver lifecycle. Targeted mode deliberately performs no request here. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.status = this.hasUsableResolution() ? "online" : "idle";
    this.schedulePump();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRetryAt = null;
    this.activeController?.abort();
    await this.inFlight;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Queue an exact DDB identity without doing network I/O on the packet path. */
  ensure(deviceType: "F" | "I" | "O", deviceId: string): void {
    const key = this.validKey(deviceType, deviceId);
    if (!key) return;
    const resolution = this.readResolution(key);
    if (resolution.status === "found") {
      if (this.now() - resolution.resolvedAt < this.refreshMs) return;
      this.enqueue(key);
      return;
    }
    if (resolution.status === "missing") return;
    this.enqueue(key);
  }

  /** Resolve the exact canonical key synchronously from the bounded RAM cache. */
  getResolution(deviceType: "F" | "I" | "O", deviceId: string): OgnDdbResolution {
    const key = this.validKey(deviceType, deviceId);
    if (!key) return { status: "unresolved" };
    const resolution = this.readResolution(key);
    if (resolution.status === "unresolved") this.cacheMisses += 1;
    else this.cacheHits += 1;
    if (resolution.status === "found") return { status: "found", entry: resolution.entry, resolvedAt: resolution.resolvedAt, expiresAt: resolution.resolvedAt + this.maxStaleMs };
    if (resolution.status === "missing") return { status: "missing", resolvedAt: resolution.resolvedAt, expiresAt: resolution.resolvedAt + this.negativeTtlMs };
    return resolution;
  }

  /** Compatibility lookup for callers that only need a positive record. */
  lookup(deviceType: "F" | "I" | "O", deviceId: string): OgnDdbEntry | null {
    const resolution = this.getResolution(deviceType, deviceId);
    return resolution.status === "found" ? resolution.entry : null;
  }

  /** Diagnostics-only aggregate; privacy decisions never use this global value. */
  isUsable(): boolean {
    return this.hasUsableResolution();
  }

  /**
   * Explicit compatibility/debug path for a full DDB request. It is never
   * called by start() or the normal OGN runtime.
   */
  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const promise = this.loadBulkSnapshot().finally(() => {
      if (this.inFlight === promise) this.inFlight = null;
    });
    this.inFlight = promise;
    await promise;
  }

  getDiagnostics(): OgnDdbDiagnostics {
    const now = this.now();
    const ageMs = this.lastSuccessAt === null ? null : Math.max(0, now - this.lastSuccessAt);
    const positiveEntries = [...this.cache.values()].filter((value) => value.status === "found").length;
    const negativeEntries = this.cache.size - positiveEntries;
    const usable = this.hasUsableResolution();
    return {
      status: this.status === "online" && !usable ? "stale" : this.status,
      strategy: this.strategy,
      representation: this.representation,
      mode: this.currentMode,
      endpoint: this.endpoint,
      entries: positiveEntries,
      cacheEntries: this.cache.size,
      positiveEntries,
      negativeEntries,
      pendingKeys: this.pendingKeys.size,
      queuedIds: new Set(this.pendingQueue.map((key) => key.slice(2))).size,
      inFlight: this.inFlightKeys.size > 0,
      requests: this.requests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      batchCount: this.batchCount,
      lastBatchSize: this.lastBatchSize,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      evictions: this.evictions,
      unexpectedRecords: this.unexpectedRecords,
      conflictingRecords: this.conflictingRecords,
      lastAttemptAt: this.lastAttemptAt === null ? null : new Date(this.lastAttemptAt).toISOString(),
      lastRefreshAt: this.lastAttemptAt === null ? null : new Date(this.lastAttemptAt).toISOString(),
      lastSuccessAt: this.lastSuccessAt === null ? null : new Date(this.lastSuccessAt).toISOString(),
      lastHttpStatus: this.lastHttpStatus,
      ageMs,
      failures: this.failures,
      fallbackCount: this.fallbackCount,
      fallbackUsed: this.fallbackUsed,
      rateLimited: this.rateLimited,
      retryAfterMs: this.retryAfterMs,
      nextRetryAt: this.nextRetryAt === null ? null : new Date(this.nextRetryAt).toISOString(),
      aircraftTypeAvailable: this.aircraftTypeAvailable,
      stale: !usable,
    };
  }

  private validKey(deviceType: "F" | "I" | "O", deviceId: string): string | null {
    const normalizedType = String(deviceType).toUpperCase();
    const normalizedId = typeof deviceId === "string" ? deviceId.trim().toUpperCase() : "";
    return isDeviceType(normalizedType) && DEVICE_ID_PATTERN.test(normalizedId) ? ddbKey(normalizedType, normalizedId) : null;
  }

  private readResolution(key: string): OgnDdbResolution {
    const cached = this.cache.get(key);
    if (!cached) {
      // An explicit compatibility bulk load is a complete snapshot, so an
      // absent key is a proven miss until that snapshot exceeds max-stale.
      // Normal targeted runtime never sets bulkCompleteAt.
      if (this.bulkCompleteAt !== null && this.now() - this.bulkCompleteAt <= this.maxStaleMs) {
        return { status: "missing", resolvedAt: this.bulkCompleteAt, expiresAt: this.bulkCompleteAt + this.maxStaleMs };
      }
      return { status: "unresolved" };
    }
    const age = Math.max(0, this.now() - cached.resolvedAt);
    const valid = cached.status === "found" ? age <= this.maxStaleMs : age < this.negativeTtlMs;
    if (!valid) return { status: "unresolved" };
    this.touch(key, cached);
    if (cached.status === "found" && cached.entry) return { status: "found", entry: cached.entry, resolvedAt: cached.resolvedAt, expiresAt: cached.resolvedAt + this.maxStaleMs };
    return { status: "missing", resolvedAt: cached.resolvedAt, expiresAt: cached.resolvedAt + this.negativeTtlMs };
  }

  private touch(key: string, value: CachedDdbResolution): void {
    this.cache.delete(key);
    this.cache.set(key, value);
  }

  private putResolution(key: string, resolution: CachedDdbResolution): void {
    this.cache.delete(key);
    this.cache.set(key, resolution);
    while (this.cache.size > this.cacheMaxEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
      this.evictions += 1;
    }
  }

  private enqueue(key: string): void {
    if (this.pendingKeys.has(key) || this.inFlightKeys.has(key)) return;
    if (this.pendingKeys.size >= this.maxPendingKeys) return;
    this.pendingKeys.add(key);
    this.pendingQueue.push(key);
    this.schedulePump();
  }

  private schedulePump(): void {
    if (!this.running || this.inFlight || this.pendingQueue.length === 0 || this.timer) return;
    const now = this.now();
    const rateLimitDelay = this.nextRetryAt === null ? 0 : Math.max(0, this.nextRetryAt - now);
    const intervalDelay = this.lastRequestAt === null ? 0 : Math.max(0, this.lastRequestAt + this.minRequestIntervalMs - now);
    const delay = Math.max(this.batchDelayMs, rateLimitDelay, intervalDelay);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.startNextBatch();
    }, delay);
  }

  private startNextBatch(): void {
    if (!this.running || this.inFlight || this.pendingQueue.length === 0) return;
    const now = this.now();
    if (this.nextRetryAt !== null && now < this.nextRetryAt) {
      this.schedulePump();
      return;
    }
    if (this.lastRequestAt !== null && now < this.lastRequestAt + this.minRequestIntervalMs) {
      this.schedulePump();
      return;
    }
    const keys: string[] = [];
    while (keys.length < this.batchSize && this.pendingQueue.length > 0) {
      const key = this.pendingQueue.shift();
      if (!key) break;
      this.pendingKeys.delete(key);
      this.inFlightKeys.add(key);
      keys.push(key);
    }
    if (!keys.length) return;
    const promise = this.loadTargetedBatch(keys).finally(() => {
      for (const key of keys) this.inFlightKeys.delete(key);
      if (this.inFlight === promise) this.inFlight = null;
      this.schedulePump();
    });
    this.inFlight = promise;
  }

  private requeue(keys: string[]): void {
    for (const key of keys) {
      // The keys are still marked in-flight while the failure handler runs;
      // the finally block removes that marker after they have been retained.
      if (this.pendingKeys.has(key) || this.pendingKeys.size >= this.maxPendingKeys) continue;
      this.pendingKeys.add(key);
      this.pendingQueue.push(key);
    }
  }

  private async loadTargetedBatch(keys: string[]): Promise<void> {
    this.batchCount += 1;
    this.lastBatchSize = keys.length;
    this.status = "loading";
    this.rateLimited = false;
    this.retryAfterMs = null;
    try {
      const requestedIds = [...new Set(keys.map((key) => key.slice(2)))];
      const controller = new AbortController();
      this.activeController = controller;
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      let loaded: { snapshot: DdbSnapshot; mode: DdbMode };
      try {
        try {
          loaded = { snapshot: await this.fetchSnapshot(this.targetedUrl(requestedIds, true), controller, true), mode: "targeted-rich-json" };
        } catch (error) {
          if (controller.signal.aborted || !shouldTryDdbFallback(error)) throw error;
          loaded = { snapshot: await this.fetchSnapshot(this.targetedUrl(requestedIds, false), controller, true), mode: "targeted-base-json" };
          this.fallbackCount += 1;
        }
      } finally {
        clearTimeout(timeout);
        if (this.activeController === controller) this.activeController = null;
      }
      this.applyTargetedSnapshot(keys, loaded.snapshot);
      this.currentMode = loaded.mode;
      this.strategy = "targeted";
      this.bulkCompleteAt = null;
      this.representation = loaded.mode === "targeted-rich-json" ? "rich" : "base";
      this.aircraftTypeAvailable ||= loaded.snapshot.aircraftTypeAvailable;
      this.lastSuccessAt = this.now();
      this.failures = 0;
      this.successfulRequests += 1;
      this.status = "online";
      this.fallbackUsed = loaded.mode === "targeted-base-json";
      this.rateLimited = false;
      this.retryAfterMs = null;
      this.nextRetryAt = null;
      this.notifyListeners();
    } catch (error) {
      this.failures += 1;
      this.failedRequests += 1;
      const rateLimitError = error instanceof DdbLoadError && error.httpStatus === 429 ? error : null;
      this.rateLimited = rateLimitError !== null;
      this.retryAfterMs = rateLimitError?.retryAfterMs ?? null;
      this.nextRetryAt = this.now() + this.getFailureRetryDelay(error);
      this.status = this.hasUsableResolution() ? "stale" : "offline";
      this.requeue(keys);
      if (this.running && !(error instanceof DOMException && error.name === "AbortError")) {
        console.error(`AirRadar OGN DDB targeted request failed (${this.failures})`);
      }
    }
  }

  private applyTargetedSnapshot(keys: string[], snapshot: DdbSnapshot): void {
    const requestedKeys = new Set(keys);
    const responseIndex = new Map<string, OgnDdbEntry>();
    const conflictingKeys = new Set<string>();
    for (const entry of snapshot.entries) {
      const key = ddbKey(entry.deviceType, entry.deviceId);
      if (!requestedKeys.has(key)) {
        this.unexpectedRecords += 1;
        continue;
      }
      const previous = responseIndex.get(key);
      if (previous) {
        if (JSON.stringify(previous) !== JSON.stringify(entry)) {
          conflictingKeys.add(key);
          responseIndex.delete(key);
          this.conflictingRecords += 1;
        }
        continue;
      }
      if (!conflictingKeys.has(key)) responseIndex.set(key, entry);
    }
    const resolvedAt = this.now();
    for (const key of keys) {
      if (conflictingKeys.has(key)) continue;
      const entry = responseIndex.get(key);
      this.putResolution(key, entry ? { status: "found", entry, resolvedAt } : { status: "missing", resolvedAt });
    }
  }

  private async loadBulkSnapshot(): Promise<void> {
    this.strategy = "bulk-compatibility";
    this.status = "loading";
    this.lastAttemptAt = this.now();
    this.nextRetryAt = null;
    this.rateLimited = false;
    this.retryAfterMs = null;
    const controller = new AbortController();
    this.activeController = controller;
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      let loaded: { snapshot: DdbSnapshot; mode: DdbMode };
      try {
        loaded = { snapshot: await this.fetchSnapshot(this.primaryUrl(), controller, false), mode: "rich-json" };
      } catch (error) {
        if (controller.signal.aborted || !shouldTryDdbFallback(error)) throw error;
        loaded = { snapshot: await this.fetchSnapshot(this.fallbackUrl(), controller, false), mode: "base-json" };
        this.fallbackCount += 1;
      }
      const previousPositive = [...this.cache.values()].filter((value) => value.status === "found").length;
      if (previousPositive >= 100 && loaded.snapshot.entries.length < Math.max(10, Math.floor(previousPositive * 0.1))) {
        throw new DdbLoadError("DDB response failed sanity-count validation", this.lastHttpStatus);
      }
      this.cache.clear();
      const resolvedAt = this.now();
      for (const entry of loaded.snapshot.entries) this.putResolution(ddbKey(entry.deviceType, entry.deviceId), { status: "found", entry, resolvedAt });
      this.currentMode = loaded.mode;
      this.bulkCompleteAt = resolvedAt;
      this.representation = loaded.mode === "rich-json" ? "rich" : "base";
      this.aircraftTypeAvailable = loaded.snapshot.aircraftTypeAvailable;
      this.lastSuccessAt = resolvedAt;
      this.failures = 0;
      this.successfulRequests += 1;
      this.status = "online";
      this.fallbackUsed = loaded.mode === "base-json";
      this.notifyListeners();
    } catch (error) {
      this.failures += 1;
      this.failedRequests += 1;
      const rateLimitError = error instanceof DdbLoadError && error.httpStatus === 429 ? error : null;
      this.rateLimited = rateLimitError !== null;
      this.retryAfterMs = rateLimitError?.retryAfterMs ?? null;
      if (this.running) this.nextRetryAt = this.now() + this.getFailureRetryDelay(error);
      this.status = this.hasUsableResolution() ? "stale" : "offline";
      if (this.running) console.error(`AirRadar OGN DDB refresh failed (${this.failures})`);
    } finally {
      clearTimeout(timeout);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch { /* diagnostics listeners are optional */ }
    }
  }

  private hasUsableResolution(): boolean {
    for (const value of this.cache.values()) {
      if (isResolutionEntry(value) && this.now() - value.resolvedAt <= this.maxStaleMs) return true;
    }
    return false;
  }

  private primaryUrl(): string {
    return this.withQuery({ j: "1", t: "1" });
  }

  private fallbackUrl(): string {
    return this.withQuery({ j: "1", t: null });
  }

  private targetedUrl(deviceIds: string[], rich: boolean): string {
    return this.withQuery({ j: "1", t: rich ? "1" : null, device_id: deviceIds.join(",") });
  }

  private withQuery(values: Record<string, string | null>): string {
    const url = new URL(this.url);
    url.search = "";
    for (const [key, value] of Object.entries(values)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private endpointFromUrl(value: string): string {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      return "https://ddb.glidernet.org/download/";
    }
  }

  private async fetchSnapshot(url: string, controller: AbortController, allowEmpty: boolean): Promise<DdbSnapshot> {
    this.requests += 1;
    this.lastAttemptAt = this.now();
    this.lastRequestAt = this.lastAttemptAt;
    const response = await this.fetcher(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": getAirRadarUserAgent("OGN DDB"),
      },
    });
    this.lastHttpStatus = response.status;
    if (!response.ok) {
      const retryAfterMs = response.status === 429 ? parseDdbRetryAfter(response.headers.get("retry-after"), this.now()) : null;
      throw new DdbLoadError(`DDB HTTP ${response.status}`, response.status, retryAfterMs);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(await readBounded(response, this.maxBytes)) as unknown;
    } catch (error) {
      throw new DdbLoadError(error instanceof Error ? error.message : "DDB response was not valid JSON", response.status);
    }
    const records = payload && typeof payload === "object" && Array.isArray((payload as { devices?: unknown }).devices)
      ? (payload as { devices: unknown[] }).devices
      : null;
    if (!records || records.length > this.maxEntries || (!allowEmpty && records.length === 0)) throw new DdbLoadError("DDB response failed schema validation", response.status);
    const entries: OgnDdbEntry[] = [];
    let aircraftTypeAvailable = false;
    for (const record of records) {
      const entry = parseEntry(record);
      if (!entry) throw new DdbLoadError("DDB response failed privacy schema validation", response.status);
      entries.push(entry);
      aircraftTypeAvailable ||= entry.aircraftType !== null;
    }
    return { entries, aircraftTypeAvailable };
  }

  private getFailureRetryDelay(error: unknown): number {
    const retryAfterMs = error instanceof DdbLoadError && error.httpStatus === 429 ? error.retryAfterMs : null;
    return retryAfterMs === null ? this.failureRetryMs : Math.max(this.failureRetryMs, retryAfterMs);
  }
}
