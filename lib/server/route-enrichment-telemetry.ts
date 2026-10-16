import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Observations of free-route lookups only. Never counts FlightAware requests. */
export const ROUTE_METRIC_KEYS = [
  "ramHit", "dbHit", "dbMiss", "dbWrite", "dbError", "dbBypassed",
  "adsbdbLookup",
  "dbLatencySamples", "dbLatencyTotalMs",
] as const;
export const ROUTE_PHASE_KEYS = [
  "routeResolution", "memoryLookup", "readThroughLoad", "postgresCacheRequest",
  // Independent upstream HTTP and paired origin/destination airport resolver
  // phases expose which await dominates routeResolution; both are wall time.
  "adsbdbRouteFetch", "airportResolution",
  "concurrencyBudget", "dbConnection", "resultProcessing", "cacheUpdate", "callerTimeout",
  "dbCallSettlement", "dbReadSettlement", "dbWriteSettlement", "dbMaintenanceSettlement",
  "dbMaintenanceCount", "dbMaintenancePrune",
  "dbLateSettlement", "callerTimeoutOvershoot",
] as const;
export type RoutePhaseKey = (typeof ROUTE_PHASE_KEYS)[number];
export type RouteMetricKey = (typeof ROUTE_METRIC_KEYS)[number];
export type RouteMetricBucket = { hour: string } & Record<RouteMetricKey, number>;
export interface RoutePhaseDistribution {
  measured: boolean;
  scope: "process-local-recent-samples";
  sampleCapacity: number;
  count: number;
  sampleCount: number;
  errors: number;
  timeouts: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}
export type RoutePhaseDiagnostics = Record<RoutePhaseKey, RoutePhaseDistribution>;
export interface RouteEnrichmentSnapshot {
  enabled: boolean;
  windowHours: 24;
  buckets: RouteMetricBucket[];
  totals: Record<RouteMetricKey, number>;
  databaseHitRate: number | null;
  estimatedSavedLookups: number;
  validEntries: number | null;
  validEntriesCheckedAt: string | null;
  databaseAverageLatencyMs: number | null;
  phases: RoutePhaseDiagnostics;
  sql: {
    active: number;
    activeWrites: number;
    maxActive: number;
    rejected: number;
    probeAttempts: number;
    probeFailures: number;
    failureStreak: number;
    halfOpenProbe: boolean;
    callerTimeouts: number;
    completedAfterCallerTimeout: number;
    /** Event-loop utilization over the DB-call interval, sampled only when its caller times out.
     * This is correlation evidence, NOT SQL execution time or CPU attributable to this call. */
    eventLoopAtTimeout: {
      scope: "process-local-recent-samples";
      sampleCapacity: number;
      sampleCount: number;
      p50Percent: number | null;
      p95Percent: number | null;
      p99Percent: number | null;
    };
    circuit: { state: "closed" | "open"; openSince: string | null; openDurationMs: number | null };
    timing: {
      measurement: "db_call_elapsed";
      serverSideOnly: false;
      includesPoolWait: true;
      includesNetworkTime: true;
      connectionAcquisition: "NOT MEASURED";
      serverSideSql: "NOT MEASURED";
      settlement: "all-route-cache-db-calls-including-failures";
      timeoutOvershoot: "callback-delay-beyond-750ms-deadline";
    };
  };
  telemetry: { diskEnabled: boolean; loadedFromDisk: boolean; lastSavedAt: string | null; failures: number };
}
const HOUR_MS = 3_600_000;
const CHECKPOINT_MS = 5 * 60_000;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_COUNT = 1_000_000_000;
const PHASE_SAMPLE_CAPACITY = 1_024;
function hourAt(ms: number): string { return new Date(Math.floor(ms / HOUR_MS) * HOUR_MS).toISOString(); }
function emptyCounts(): Record<RouteMetricKey, number> {
  return Object.fromEntries(ROUTE_METRIC_KEYS.map(k => [k, 0])) as Record<RouteMetricKey, number>;
}
function createBucket(hour: string): RouteMetricBucket { return { hour, ...emptyCounts() }; }
function emptyPhaseSamples(): Record<RoutePhaseKey, number[]> {
  return Object.fromEntries(ROUTE_PHASE_KEYS.map(key => [key, []])) as unknown as Record<RoutePhaseKey, number[]>;
}
function emptyPhaseDiagnostics(): RoutePhaseDiagnostics {
  return Object.fromEntries(ROUTE_PHASE_KEYS.map(key => [key, {
    measured: false, scope: "process-local-recent-samples" as const, sampleCapacity: PHASE_SAMPLE_CAPACITY,
    count: 0, sampleCount: 0, errors: 0, timeouts: 0,
    p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null,
  }])) as RoutePhaseDiagnostics;
}
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
  // Fixed-size, process-local ring. O(1) recording on the route-cache hot path.
  // Query-time distributions do not include failed/timed-out SQL operations.
  private readonly recentDbQueries: { at: number; ms: number }[] = [];
  private nextDbQuerySlot = 0;
  private readonly eventLoopAtTimeoutSamples: number[] = [];
  private nextEventLoopAtTimeoutSlot = 0;
  private readonly phaseSamples = emptyPhaseSamples();
  private readonly phaseNextSlots = Object.fromEntries(ROUTE_PHASE_KEYS.map(key => [key, 0])) as Record<RoutePhaseKey, number>;
  private readonly phaseCounts = Object.fromEntries(ROUTE_PHASE_KEYS.map(key => [key, 0])) as Record<RoutePhaseKey, number>;
  private readonly phaseErrors = Object.fromEntries(ROUTE_PHASE_KEYS.map(key => [key, 0])) as Record<RoutePhaseKey, number>;
  private readonly phaseTimeouts = Object.fromEntries(ROUTE_PHASE_KEYS.map(key => [key, 0])) as Record<RoutePhaseKey, number>;
  private lastRecordPruneAt: number | null = null;
  private sqlDiagnostics = {
    active: 0, activeWrites: 0, maxActive: 0, rejected: 0,
    probeAttempts: 0, probeFailures: 0, failureStreak: 0, halfOpenProbe: false,
    callerTimeouts: 0, completedAfterCallerTimeout: 0,
    circuit: { state: "closed" as "closed" | "open", openSince: null as string | null, openDurationMs: null as number | null },
  };
  private circuitOpenUntilMs: number | null = null;

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

  private pruneForRecord(now: number): void {
    // Recording is on the enrichment hot path. The rolling map is hourly, so
    // pruning it for every counter repeats bounded work without changing
    // retention semantics.
    if (this.lastRecordPruneAt !== null && now >= this.lastRecordPruneAt && now - this.lastRecordPruneAt < HOUR_MS) return;
    this.prune(now);
    this.lastRecordPruneAt = now;
  }

  record(key: RouteMetricKey, count = 1): void {
    if (!Number.isFinite(count) || count <= 0) return;
    const now = this.clock();
    this.pruneForRecord(now);
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
    const entry = { at: this.clock(), ms };
    if (this.recentDbQueries.length < 1_024) this.recentDbQueries.push(entry);
    else this.recentDbQueries[this.nextDbQuerySlot] = entry;
    this.nextDbQuerySlot = (this.nextDbQuerySlot + 1) % 1_024;
    this.record("dbLatencySamples");
    this.record("dbLatencyTotalMs", ms === 0 ? 0.001 : ms);
  }

  recordPhase(key: RoutePhaseKey, ms: number, outcome: "ok" | "error" | "timeout" = "ok"): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const samples = this.phaseSamples[key];
    if (samples.length < PHASE_SAMPLE_CAPACITY) samples.push(ms);
    else { samples[this.phaseNextSlots[key]] = ms; }
    this.phaseNextSlots[key] = (this.phaseNextSlots[key] + 1) % PHASE_SAMPLE_CAPACITY;
    this.phaseCounts[key] = Math.min(MAX_COUNT, this.phaseCounts[key] + 1);
    if (outcome === "error") this.phaseErrors[key] = Math.min(MAX_COUNT, this.phaseErrors[key] + 1);
    if (outcome === "timeout") this.phaseTimeouts[key] = Math.min(MAX_COUNT, this.phaseTimeouts[key] + 1);
  }

  /** Elapsed event-loop utilization from perf_hooks during a timed-out call, in [0, 1].
   * Ring is process-local and bounded. No route IDs, SQL, credentials or timings are persisted. */
  recordTimeoutEventLoopUtilization(utilization: number): void {
    if (!Number.isFinite(utilization) || utilization < 0 || utilization > 1) return;
    const percent = utilization * 100;
    if (this.eventLoopAtTimeoutSamples.length < PHASE_SAMPLE_CAPACITY) {
      this.eventLoopAtTimeoutSamples.push(percent);
    } else {
      this.eventLoopAtTimeoutSamples[this.nextEventLoopAtTimeoutSlot] = percent;
    }
    this.nextEventLoopAtTimeoutSlot = (this.nextEventLoopAtTimeoutSlot + 1) % PHASE_SAMPLE_CAPACITY;
  }

  private eventLoopAtTimeoutSnapshot(): RouteEnrichmentSnapshot["sql"]["eventLoopAtTimeout"] {
    const values = this.eventLoopAtTimeoutSamples.slice().sort((a, b) => a - b);
    const rank = (p: number) => values.length ? values[Math.ceil(values.length * p) - 1] ?? null : null;
    return {
      scope: "process-local-recent-samples",
      sampleCapacity: PHASE_SAMPLE_CAPACITY,
      sampleCount: values.length,
      p50Percent: rank(0.5), p95Percent: rank(0.95), p99Percent: rank(0.99),
    };
  }

  getPhaseDiagnostics(): RoutePhaseDiagnostics {
    const result = emptyPhaseDiagnostics();
    for (const key of ROUTE_PHASE_KEYS) {
      const values = this.phaseSamples[key].slice().sort((a, b) => a - b);
      const rank = (p: number) => values.length ? values[Math.ceil(values.length * p) - 1] ?? null : null;
      result[key] = {
        measured: values.length > 0, scope: "process-local-recent-samples", sampleCapacity: PHASE_SAMPLE_CAPACITY,
        count: this.phaseCounts[key], sampleCount: values.length,
        errors: this.phaseErrors[key], timeouts: this.phaseTimeouts[key],
        p50Ms: rank(0.5), p95Ms: rank(0.95), p99Ms: rank(0.99), maxMs: values.at(-1) ?? null,
      };
    }
    return result;
  }

  setSqlDiagnostics(value: {
    active: number; maxActive: number; rejected: number; callerTimeouts: number;
    completedAfterCallerTimeout: number;
    activeWrites?: number; probeAttempts?: number; probeFailures?: number;
    failureStreak?: number; halfOpenProbe?: boolean;
    circuit: { state: "closed" | "open"; openSince: string | null; openDurationMs: number | null };
    circuitOpenUntilMs?: number | null;
  }): void {
    this.sqlDiagnostics = {
      active: Math.max(0, value.active), activeWrites: Math.max(0, value.activeWrites ?? 0),
      maxActive: Math.max(0, value.maxActive), rejected: Math.max(0, value.rejected),
      probeAttempts: Math.max(0, value.probeAttempts ?? 0), probeFailures: Math.max(0, value.probeFailures ?? 0),
      failureStreak: Math.max(0, value.failureStreak ?? 0), halfOpenProbe: value.halfOpenProbe ?? false,
      callerTimeouts: Math.max(0, value.callerTimeouts),
      completedAfterCallerTimeout: Math.max(0, value.completedAfterCallerTimeout),
      circuit: { ...value.circuit },
    };
    this.circuitOpenUntilMs = value.circuitOpenUntilMs ?? null;
  }

  /** Successful route-cache DB-call elapsed timings over the last hour, not server-side SQL time. */
  getDbLatencyDistribution() {
    const cutoff = this.clock() - 60 * 60_000;
    const values = this.recentDbQueries.filter((entry) => entry.at >= cutoff)
      .map((entry) => entry.ms).sort((a, b) => a - b);
    const n = values.length;
    const rank = (p: number) => n ? values[Math.ceil(n * p) - 1] ?? null : null;
    return {
      source: "successful-route-cache-db-call-elapsed" as const,
      processLocal: true,
      windowMinutes: 60,
      sampleCapacity: 1_024,
      sampleCount: n,
      p50Ms: rank(0.5), p95Ms: rank(0.95), p99Ms: rank(0.99),
      maxMs: n ? values[n - 1] ?? null : null,
      averageMs: n ? values.reduce((sum, value) => sum + value, 0) / n : null,
    };
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
    // The elapsed cooldown permits ONE probe; it does not close the circuit.
    // Keep reporting OPEN until that probe succeeds or the DB is unconfigured.
    const circuitOpen = this.sqlDiagnostics.failureStreak > 0
      || this.sqlDiagnostics.halfOpenProbe
      || (this.circuitOpenUntilMs !== null && now < this.circuitOpenUntilMs);
    const circuit = circuitOpen
      ? { ...this.sqlDiagnostics.circuit, state: "open" as const, openDurationMs: this.sqlDiagnostics.circuit.openSince ? Math.max(0, now - Date.parse(this.sqlDiagnostics.circuit.openSince)) : null }
      : { state: "closed" as const, openSince: null, openDurationMs: null };
    return {
      enabled: process.env.ROUTE_DB_CACHE_ENABLED?.trim().toLowerCase() === "true",
      windowHours: 24,
      buckets,
      totals,
      databaseHitRate: lookups > 0 ? totals.dbHit / lookups : null,
      // Avoided route lookups, not guaranteed HTTP requests (ADSB.lol is batched).
      estimatedSavedLookups: totals.ramHit + totals.dbHit,
      validEntries: this.validEntries,
      validEntriesCheckedAt: this.validEntriesCheckedAt,
      databaseAverageLatencyMs: totals.dbLatencySamples ? totals.dbLatencyTotalMs / totals.dbLatencySamples : null,
      phases: this.getPhaseDiagnostics(),
      sql: {
        ...this.sqlDiagnostics,
        eventLoopAtTimeout: this.eventLoopAtTimeoutSnapshot(),
        circuit,
        timing: {
          measurement: "db_call_elapsed",
          serverSideOnly: false,
          includesPoolWait: true,
          includesNetworkTime: true,
          connectionAcquisition: "NOT MEASURED",
          serverSideSql: "NOT MEASURED",
          settlement: "all-route-cache-db-calls-including-failures",
          timeoutOvershoot: "callback-delay-beyond-750ms-deadline",
        },
      },
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
