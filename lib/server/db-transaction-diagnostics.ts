import { classifyDbFailure, DB_FAILURE_FAMILIES, type DbFailureFamily } from "@/lib/server/db-failure-classification";
/**
 * Bounded, process-local attribution for AirRadar-owned explicit DB
 * transactions. This deliberately does not observe SQL or write diagnostics
 * to PostgreSQL.
 */

export const DB_TRANSACTION_LANES = [
  "history.snapshot",
  "receiver.daily-stats",
  "receiver.coverage",
  "receiver.advanced-stats",
  "aircraft-metadata.catalog",
  "maintenance.airports-sync",
  "maintenance.atc-import",
  "operational-twin.calibration",
] as const;

export type DbTransactionLane = (typeof DB_TRANSACTION_LANES)[number];
type FailureFamilies = Record<DbFailureFamily, number>;
type Bucket = { startedAtMs: number; attempts: number; commits: number; failures: number; totalDurationMs: number; maxDurationMs: number; workUnits: number; failureFamilies: FailureFamilies };
type LaneState = { attempts: number; commits: number; failures: number; active: number; maxConcurrent: number; totalDurationMs: number; maxDurationMs: number; workUnits: number; buckets: Bucket[] };
type DbTransactionDiagnosticsStore = {
  startedAtMs: number;
  lanes: Map<DbTransactionLane, LaneState>;
  storeId: string;
};

const LANE_SET = new Set<string>(DB_TRANSACTION_LANES);
const failureFamilies: Record<DbFailureFamily, number> = { timeout: 0, constraint: 0, conflict: 0, connection: 0, other: 0, unknown: 0 };
function emptyFailureFamilies(): FailureFamilies {
  return Object.fromEntries(DB_FAILURE_FAMILIES.map((family) => [family, 0])) as FailureFamilies;
}
const WINDOW_MS = 60 * 60_000;
const BUCKET_MS = 60_000;
const globalForDbTransactionDiagnostics = globalThis as typeof globalThis & {
  airRadarDbTransactionDiagnostics?: DbTransactionDiagnosticsStore;
};

function createStore(): DbTransactionDiagnosticsStore {
  return {
    startedAtMs: Date.now(),
    lanes: new Map<DbTransactionLane, LaneState>(),
    storeId: `dbtx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

const store = globalForDbTransactionDiagnostics.airRadarDbTransactionDiagnostics ??= createStore();

function state(lane: DbTransactionLane): LaneState {
  let value = store.lanes.get(lane);
  if (!value) {
    value = { attempts: 0, commits: 0, failures: 0, active: 0, maxConcurrent: 0, totalDurationMs: 0, maxDurationMs: 0, workUnits: 0, buckets: [] };
    store.lanes.set(lane, value);
  }
  return value;
}

function bucketFor(value: LaneState, now: number): Bucket {
  const started = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  let bucket = value.buckets[value.buckets.length - 1];
  if (!bucket || bucket.startedAtMs !== started) {
    bucket = { startedAtMs: started, attempts: 0, commits: 0, failures: 0, totalDurationMs: 0, maxDurationMs: 0, workUnits: 0, failureFamilies: emptyFailureFamilies() };
    value.buckets.push(bucket);
  }
  const cutoff = now - WINDOW_MS;
  while (value.buckets.length && value.buckets[0]!.startedAtMs < cutoff) value.buckets.shift();
  return bucket;
}

function assertLane(lane: string): asserts lane is DbTransactionLane {
  if (!LANE_SET.has(lane)) throw new Error(`Unknown DB transaction diagnostics lane: ${lane}`);
}

export interface DbTransactionDiagnosticsSnapshot {
  scope: "process-local";
  processId: number;
  diagnosticsStoreId: string;
  startedAt: string;
  uptimeSeconds: number;
  failureFamilies: Record<"5m" | "15m" | "60m", FailureFamilies>;
  lanes: Record<DbTransactionLane, {
    attempts: number; commits: number; failures: number; active: number; maxConcurrent: number;
    totalDurationMs: number; maxDurationMs: number; workUnits: number;
    windows: Record<"5m" | "15m" | "60m", { attempts: number; commits: number; failures: number; totalDurationMs: number; maxDurationMs: number; workUnits: number }>;
  }>;
}

function window(value: LaneState, now: number, durationMs: number) {
  const cutoff = now - durationMs;
  return value.buckets.filter((item) => item.startedAtMs >= cutoff).reduce((sum, item) => ({
    attempts: sum.attempts + item.attempts,
    commits: sum.commits + item.commits,
    failures: sum.failures + item.failures,
    totalDurationMs: sum.totalDurationMs + item.totalDurationMs,
    maxDurationMs: Math.max(sum.maxDurationMs, item.maxDurationMs),
    workUnits: sum.workUnits + item.workUnits,
    failureFamilies: Object.fromEntries(DB_FAILURE_FAMILIES.map((family) => [family, sum.failureFamilies[family] + item.failureFamilies[family]])) as FailureFamilies,
  }), { attempts: 0, commits: 0, failures: 0, totalDurationMs: 0, maxDurationMs: 0, workUnits: 0, failureFamilies: emptyFailureFamilies() });
}

export async function trackDbTransaction<T>(
  lane: DbTransactionLane,
  operation: () => Promise<T>,
  workUnits: number | (() => number) = 0,
): Promise<T> {
  assertLane(lane);
  const value = state(lane);
  const started = Date.now();
  let committed = false;
  let failureFamily: DbFailureFamily | null = null;
  value.attempts += 1;
  value.active += 1;
  value.maxConcurrent = Math.max(value.maxConcurrent, value.active);
  try {
    const result = await operation();
    committed = true;
    value.commits += 1;
    return result;
  } catch (error) {
    failureFamily = classifyDbFailure(error);
    failureFamilies[failureFamily] += 1;
    value.failures += 1;
    throw error;
  } finally {
    try {
      const duration = Math.max(0, Date.now() - started);
      const resolvedWorkUnits = typeof workUnits === "function" ? workUnits() : workUnits;
      const boundedWorkUnits = Number.isFinite(resolvedWorkUnits) ? Math.max(0, resolvedWorkUnits) : 0;
      value.active = Math.max(0, value.active - 1);
      value.totalDurationMs += duration;
      value.maxDurationMs = Math.max(value.maxDurationMs, duration);
      value.workUnits += boundedWorkUnits;
      const bucket = bucketFor(value, Date.now());
      bucket.attempts += 1;
      if (committed) bucket.commits += 1;
      else bucket.failures += 1;
      bucket.totalDurationMs += duration;
      bucket.maxDurationMs = Math.max(bucket.maxDurationMs, duration);
      bucket.workUnits += boundedWorkUnits;
      if (failureFamily) bucket.failureFamilies[failureFamily] += 1;
    } catch {
      // Diagnostics are best effort and must never change DB behavior.
    }
  }
}

// Kept separate so tests and a process-level restart never share state.
export function getDbTransactionDiagnostics(now = Date.now()): DbTransactionDiagnosticsSnapshot {
  const result = {} as DbTransactionDiagnosticsSnapshot["lanes"];
  for (const lane of DB_TRANSACTION_LANES) {
    const value = state(lane);
    while (value.buckets.length && value.buckets[0]!.startedAtMs < now - WINDOW_MS) value.buckets.shift();
    result[lane] = {
      attempts: value.attempts, commits: value.commits, failures: value.failures, active: value.active,
      maxConcurrent: value.maxConcurrent, totalDurationMs: value.totalDurationMs, maxDurationMs: value.maxDurationMs, workUnits: value.workUnits,
      windows: { "5m": window(value, now, 5 * 60_000), "15m": window(value, now, 15 * 60_000), "60m": window(value, now, 60 * 60_000) },
    };
  }
  const all = [...store.lanes.values()];
  const aggregate = (durationMs: number): FailureFamilies => all.reduce((result, value) => {
    const families = window(value, now, durationMs).failureFamilies;
    for (const family of DB_FAILURE_FAMILIES) result[family] += families[family];
    return result;
  }, emptyFailureFamilies());
  return {
    scope: "process-local",
    processId: process.pid,
    diagnosticsStoreId: store.storeId,
    startedAt: new Date(store.startedAtMs).toISOString(),
    uptimeSeconds: Math.max(0, (now - store.startedAtMs) / 1000),
    failureFamilies: { "5m": aggregate(5 * 60_000), "15m": aggregate(15 * 60_000), "60m": aggregate(60 * 60_000) },
    lanes: result,
  };
}

export function resetDbTransactionDiagnosticsForTests(): void {
  store.lanes.clear();
}

/** Process-local failure classes, aggregated without error text or parameters. */
export function getDbTransactionFailureFamilies(): Readonly<Record<DbFailureFamily, number>> {
  return { ...failureFamilies };
}
