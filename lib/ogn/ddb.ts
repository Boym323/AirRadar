import type { OgnDdbDiagnostics, OgnDdbEntry } from "@/lib/ogn/types";
import { getAirRadarUserAgent } from "@/lib/server/user-agent";

export const DEFAULT_OGN_DDB_URL = "https://ddb.glidernet.org/download/?j=1&t=1";
export const DEFAULT_OGN_DDB_FALLBACK_URL = "https://ddb.glidernet.org/download/?j=1";
export const DEFAULT_OGN_DDB_REFRESH_MS = 6 * 60 * 60_000;
export const DEFAULT_OGN_DDB_MAX_STALE_MS = 24 * 60 * 60_000;
export const DEFAULT_OGN_DDB_FAILURE_RETRY_MS = 10 * 60_000;
const MAX_DDB_BYTES = 16 * 1024 * 1024;
const MAX_DDB_ENTRIES = 100_000;

export interface OgnDdbOptions {
  url?: string;
  refreshMs?: number;
  maxStaleMs?: number;
  requestTimeoutMs?: number;
  maxBytes?: number;
  maxEntries?: number;
  failureRetryMs?: number;
  fetcher?: typeof fetch;
  now?: () => number;
}

type DdbMode = "rich-json" | "base-json";

interface DdbSnapshot {
  index: Map<string, OgnDdbEntry>;
  aircraftTypeAvailable: boolean;
}

class DdbLoadError extends Error {
  readonly httpStatus: number | null;

  constructor(message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "DdbLoadError";
    this.httpStatus = httpStatus;
  }
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
  if ((deviceType !== "F" && deviceType !== "I" && deviceType !== "O") || !/^[A-F0-9]{6}$/.test(deviceId)) return null;
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

export class OgnDdb {
  private readonly url: string;
  private readonly refreshMs: number;
  private readonly maxStaleMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly failureRetryMs: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private index = new Map<string, OgnDdbEntry>();
  private currentMode: DdbMode | null = null;
  private readonly endpoint: string;
  private lastRefreshAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastHttpStatus: number | null = null;
  private failures = 0;
  private fallbackCount = 0;
  private fallbackUsed = false;
  private aircraftTypeAvailable = false;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private activeController: AbortController | null = null;
  private status: OgnDdbDiagnostics["status"] = "offline";
  private readonly listeners = new Set<() => void>();

  constructor(options: OgnDdbOptions = {}) {
    this.url = options.url ?? DEFAULT_OGN_DDB_URL;
    this.refreshMs = Math.max(60_000, options.refreshMs ?? DEFAULT_OGN_DDB_REFRESH_MS);
    this.maxStaleMs = Math.max(this.refreshMs, options.maxStaleMs ?? DEFAULT_OGN_DDB_MAX_STALE_MS);
    this.requestTimeoutMs = Math.max(500, options.requestTimeoutMs ?? 10_000);
    this.maxBytes = Math.min(MAX_DDB_BYTES, Math.max(1024, options.maxBytes ?? MAX_DDB_BYTES));
    this.maxEntries = Math.min(MAX_DDB_ENTRIES, Math.max(1, options.maxEntries ?? MAX_DDB_ENTRIES));
    this.failureRetryMs = Math.min(60 * 60_000, Math.max(5 * 60_000, options.failureRetryMs ?? DEFAULT_OGN_DDB_FAILURE_RETRY_MS));
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.endpoint = this.endpointFromUrl(options.url ?? DEFAULT_OGN_DDB_URL);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.refresh();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.activeController?.abort();
    await this.inFlight;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.loadSnapshot().finally(() => { this.inFlight = null; });
    await this.inFlight;
  }

  lookup(deviceType: "F" | "I" | "O", deviceId: string): OgnDdbEntry | null {
    return this.index.get(ddbKey(deviceType, deviceId)) ?? null;
  }

  isUsable(): boolean {
    return this.index.size > 0 && this.lastSuccessAt !== null && this.now() - this.lastSuccessAt <= this.maxStaleMs;
  }

  getDiagnostics(): OgnDdbDiagnostics {
    const ageMs = this.lastSuccessAt === null ? null : Math.max(0, this.now() - this.lastSuccessAt);
    return {
      status: this.status === "online" && ageMs !== null && ageMs > this.maxStaleMs ? "stale" : this.status,
      mode: this.currentMode,
      endpoint: this.endpoint,
      entries: this.index.size,
      lastAttemptAt: this.lastRefreshAt === null ? null : new Date(this.lastRefreshAt).toISOString(),
      lastRefreshAt: this.lastRefreshAt === null ? null : new Date(this.lastRefreshAt).toISOString(),
      lastSuccessAt: this.lastSuccessAt === null ? null : new Date(this.lastSuccessAt).toISOString(),
      lastHttpStatus: this.lastHttpStatus,
      ageMs,
      failures: this.failures,
      fallbackCount: this.fallbackCount,
      fallbackUsed: this.fallbackUsed,
      aircraftTypeAvailable: this.aircraftTypeAvailable,
      stale: !this.isUsable(),
    };
  }

  private async loadSnapshot(): Promise<void> {
    this.status = "loading";
    this.lastRefreshAt = this.now();
    const controller = new AbortController();
    this.activeController = controller;
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      let loaded: { snapshot: DdbSnapshot; mode: DdbMode } | null = null;
      try {
        loaded = { snapshot: await this.fetchSnapshot(this.primaryUrl(), controller), mode: "rich-json" };
      } catch (error) {
        if (controller.signal.aborted) throw error;
        loaded = { snapshot: await this.fetchSnapshot(this.fallbackUrl(), controller), mode: "base-json" };
        this.fallbackCount += 1;
      }
      this.index = loaded.snapshot.index;
      this.currentMode = loaded.mode;
      this.fallbackUsed = loaded.mode === "base-json";
      this.aircraftTypeAvailable = loaded.snapshot.aircraftTypeAvailable;
      this.lastSuccessAt = this.now();
      this.failures = 0;
      this.status = "online";
      for (const listener of this.listeners) {
        try { listener(); } catch { /* diagnostics listeners are optional */ }
      }
    } catch {
      this.failures += 1;
      this.status = this.isUsable() ? "stale" : "offline";
      if (this.running) console.error(`AirRadar OGN DDB refresh failed (${this.failures})`);
    } finally {
      clearTimeout(timeout);
      if (this.activeController === controller) this.activeController = null;
      if (this.running) {
        const delay = this.status === "stale" || this.status === "offline" ? Math.min(this.refreshMs, this.failureRetryMs) : this.refreshMs;
        this.timer = setTimeout(() => { this.timer = null; void this.refresh(); }, delay);
      }
    }
  }

  private primaryUrl(): string {
    return this.withQuery({ j: "1", t: "1" });
  }

  private fallbackUrl(): string {
    return this.withQuery({ j: "1", t: null });
  }

  private withQuery(values: Record<string, string | null>): string {
    const url = new URL(this.url);
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

  private async fetchSnapshot(url: string, controller: AbortController): Promise<DdbSnapshot> {
    const response = await this.fetcher(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": getAirRadarUserAgent("OGN DDB"),
      },
    });
    this.lastHttpStatus = response.status;
    if (!response.ok) throw new DdbLoadError(`DDB HTTP ${response.status}`, response.status);
    let payload: unknown;
    try {
      payload = JSON.parse(await readBounded(response, this.maxBytes)) as unknown;
    } catch (error) {
      throw new DdbLoadError(error instanceof Error ? error.message : "DDB response was not valid JSON", response.status);
    }
    const records = payload && typeof payload === "object" && Array.isArray((payload as { devices?: unknown }).devices)
      ? (payload as { devices: unknown[] }).devices
      : null;
    if (!records || records.length === 0 || records.length > this.maxEntries) throw new DdbLoadError("DDB response failed schema validation", response.status);
    const next = new Map<string, OgnDdbEntry>();
    let aircraftTypeAvailable = false;
    for (const record of records) {
      const entry = parseEntry(record);
      // Privacy-critical fields are mandatory for every accepted record. A
      // partially valid snapshot is rejected so it can never weaken policy.
      if (!entry) throw new DdbLoadError("DDB response failed privacy schema validation", response.status);
      next.set(ddbKey(entry.deviceType, entry.deviceId), entry);
      aircraftTypeAvailable ||= entry.aircraftType !== null;
    }
    if (next.size === 0) throw new DdbLoadError("DDB response contained no valid devices", response.status);
    if (this.index.size >= 100 && next.size < Math.max(10, Math.floor(this.index.size * 0.1))) throw new DdbLoadError("DDB response failed sanity-count validation", response.status);
    return { index: next, aircraftTypeAvailable };
  }
}
