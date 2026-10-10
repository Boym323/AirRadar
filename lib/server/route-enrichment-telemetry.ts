import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Observations of free-route lookups only. Never counts FlightAware requests. */
export const ROUTE_METRIC_KEYS = [
  "ramHit", "dbHit", "dbMiss", "dbWrite", "dbError", "dbBypassed",
  "adsbdbLookup", "adsblolBatch", "adsblolLookup", "adsblolError",
  "dbLatencySamples", "dbLatencyTotalMs",
] as const;
export type RouteMetricKey = (typeof ROUTE_METRIC_KEYS)[number];
export type RouteMetricBucket = { hour: string } & Record<RouteMetricKey, number>;
export interface RouteEnrichmentSnapshot {
  windowHours: 24;
  buckets: RouteMetricBucket[];
  totals: Record<RouteMetricKey, number>;
  databaseHitRate: number | null;
  estimatedSavedLookups: number;
  validEntries: number | null;
  validEntriesCheckedAt: string | null;
  databaseAverageLatencyMs: number | null;
  telemetry: { diskEnabled: boolean; loadedFromDisk: boolean; lastSavedAt: string | null; failures: number };
}
const HOUR_MS = 3_600_000;
const CHECKPOINT_MS = 5 * 60_000;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_COUNT = 1_000_000_000;
function hourAt(ms: number): string { return new Date(Math.floor(ms / HOUR_MS) * HOUR_MS).toISOString(); }
function emptyCounts(): Record<RouteMetricKey, number> {
  return Object.fromEntries(ROUTE_METRIC_KEYS.map(k => [k, 0])) as Record<RouteMetricKey, number>;
}
function createBucket(hour: string): RouteMetricBucket { return { hour, ...emptyCounts() }; }
function validBucket(value: unknown, now: number): RouteMetricBucket | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<RouteMetricBucket>;
  const date = typeof v.hour === "string" ? Date.parse(v.hour) : NaN;
  if (!Number.isFinite(date) || date !== Math.floor(date / HOUR_MS) * HOUR_MS
    || date > now || date < now - 25 * HOUR_MS) return null;
  const bucket = createBucket(hourAt(date));
  for (const key of ROUTE_METRIC_KEYS) {
    const count = v[key];
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0 || count > MAX_COUNT) return null;
    bucket[key] = count;
  }
  return bucket;
}

/**
 * 24-hour rolling hourly counters. No raw callsigns, positions, aircraft IDs or
 * external responses are retained. Event recording is O(1) and never writes.
 * A single 5-minute coalesced checkpoint saves the small JSON state atomically.
 */
export class RouteEnrichmentTelemetry {
  private readonly hours = new Map<string, RouteMetricBucket>();
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private loadedFromDisk = false;
  private failures = 0;
  private lastSavedAt: string | null = null;
  private validEntries: number | null = null;
  private validEntriesCheckedAt: string | null = null;

  constructor(
    private readonly filePath: string | null = process.env.ROUTE_TELEMETRY_FILE?.trim()
      || (process.env.NODE_ENV === "production" ? "/var/lib/airradar/route-enrichment-telemetry-v1.json" : null),
    private readonly clock: () => number = Date.now,
  ) {
    if (!filePath) return;
    try {
      const raw = readFileSync(filePath, "utf8");
      if (raw.length > MAX_FILE_BYTES) throw new Error("route_metrics_file_too_large");
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1
        || !Array.isArray((parsed as { buckets?: unknown }).buckets)) throw new Error("route_metrics_invalid");
      for (const row of (parsed as { buckets: unknown[] }).buckets.slice(-25)) {
        const bucket = validBucket(row, this.clock());
        if (bucket) this.hours.set(bucket.hour, bucket);
      }
      this.loadedFromDisk = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.failures++;
    }
  }

  private prune(now: number) {
    const oldestHour = Math.floor((now - 23 * HOUR_MS) / HOUR_MS) * HOUR_MS;
    for (const hour of this.hours.keys()) if (Date.parse(hour) < oldestHour) this.hours.delete(hour);
  }

  record(key: RouteMetricKey, count = 1): void {
    if (!Number.isFinite(count) || count <= 0) return;
    const now = this.clock();
    this.prune(now);
    const hour = hourAt(now);
    let bucket = this.hours.get(hour);
    if (!bucket) { bucket = createBucket(hour); this.hours.set(hour, bucket); }
    bucket[key] = Math.min(MAX_COUNT, bucket[key] + count);
    this.dirty = true;
    if (!this.timer && this.filePath) {
      this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, CHECKPOINT_MS);
      this.timer.unref?.();
    }
  }

  recordDbLatency(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.record("dbLatencySamples");
    this.record("dbLatencyTotalMs", ms === 0 ? 0.001 : ms);
  }

  setValidEntries(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) return;
    this.validEntries = count;
    this.validEntriesCheckedAt = new Date(this.clock()).toISOString();
  }

  getSnapshot(): RouteEnrichmentSnapshot {
    const now = this.clock();
    this.prune(now);
    const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
    const buckets = Array.from({ length: 24 }, (_, i) => {
      const key = hourAt(currentHour - (23 - i) * HOUR_MS);
      return { ...(this.hours.get(key) ?? createBucket(key)) };
    });
    const totals = emptyCounts();
    for (const bucket of buckets) for (const key of ROUTE_METRIC_KEYS) totals[key] += bucket[key];
    const lookups = totals.dbHit + totals.dbMiss;
    return {
      windowHours: 24,
      buckets,
      totals,
      databaseHitRate: lookups > 0 ? totals.dbHit / lookups : null,
      // Avoided route lookups, not guaranteed HTTP requests (ADSB.lol is batched).
      estimatedSavedLookups: totals.ramHit + totals.dbHit,
      validEntries: this.validEntries,
      validEntriesCheckedAt: this.validEntriesCheckedAt,
      databaseAverageLatencyMs: totals.dbLatencySamples ? totals.dbLatencyTotalMs / totals.dbLatencySamples : null,
      telemetry: { diskEnabled: !!this.filePath, loadedFromDisk: this.loadedFromDisk, lastSavedAt: this.lastSavedAt, failures: this.failures },
    };
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!this.filePath || !this.dirty) return;
    if (this.saving) { await this.saving; if (!this.dirty) return; }
    this.prune(this.clock());
    const filePath = this.filePath;
    const contents = JSON.stringify({ version: 1, buckets: [...this.hours.values()] });
    this.dirty = false;
    this.saving = (async () => {
      const tmp = filePath + ".tmp";
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(tmp, contents, { encoding: "utf8", mode: 0o600 });
        await rename(tmp, filePath);
        this.lastSavedAt = new Date(this.clock()).toISOString();
      } catch {
        this.failures++;
        this.dirty = true;
      } finally { this.saving = null; }
    })();
    await this.saving;
    if (this.dirty && !this.timer) {
      this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, CHECKPOINT_MS);
      this.timer.unref?.();
    }
  }
}

const globalMetrics = globalThis as unknown as { airRadarRouteEnrichmentTelemetry?: RouteEnrichmentTelemetry };
export function getRouteEnrichmentTelemetry(): RouteEnrichmentTelemetry {
  globalMetrics.airRadarRouteEnrichmentTelemetry ??= new RouteEnrichmentTelemetry();
  return globalMetrics.airRadarRouteEnrichmentTelemetry;
}
