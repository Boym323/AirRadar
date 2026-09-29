/** Best-effort attribution for standalone ORM calls (PostgreSQL autocommit candidates). */
export const DB_OPERATION_LANES = [
  "navigation.observation.create",
  "navigation.anomaly.upsert",
  "navigation.history.query",
  "weather.observation.create",
  "weather.observation.query",
  "aircraft-metadata.cache.lookup",
  "receiver.reception-record.query",
  "atc.dataset.load",
  "system-status.db-health.query",
  "system-status.airport-count.query",
  "flight-intelligence.airport-index.query",
  "flight-intelligence.event.query",
  "flight-intelligence.flight-link.query",
  "flight-intelligence.event.create",
  "history.list.query",
  "history.flight-detail.query",
  "history.aircraft-quick.query",
  "history.aircraft-detail.query",
] as const;

export type DbOperationLane = (typeof DB_OPERATION_LANES)[number];
export type DbOperationKind = "READ" | "WRITE";
export type DbOperationType = "SELECT" | "INSERT" | "UPDATE" | "UPSERT" | "DELETE" | "OTHER";
type Bucket = { startedAtMs: number; attempts: number; successes: number; failures: number; totalDurationMs: number; maxDurationMs: number; workUnits: number };
type LaneState = { attempts: number; successes: number; failures: number; active: number; maxConcurrent: number; totalDurationMs: number; maxDurationMs: number; workUnits: number; buckets: Bucket[] };
type Store = { startedAtMs: number; storeId: string; lanes: Map<DbOperationLane, LaneState> };

const WINDOW_MS = 60 * 60_000;
const BUCKET_MS = 60_000;
const laneSet = new Set<string>(DB_OPERATION_LANES);
const globalStore = globalThis as typeof globalThis & { airRadarDbOperationDiagnostics?: Store };
const store = globalStore.airRadarDbOperationDiagnostics ??= {
  startedAtMs: Date.now(),
  storeId: `dbop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
  lanes: new Map(),
};

function getLane(lane: DbOperationLane): LaneState {
  let state = store.lanes.get(lane);
  if (!state) {
    state = { attempts: 0, successes: 0, failures: 0, active: 0, maxConcurrent: 0, totalDurationMs: 0, maxDurationMs: 0, workUnits: 0, buckets: [] };
    store.lanes.set(lane, state);
  }
  return state;
}

function bucket(state: LaneState, now: number): Bucket {
  const startedAtMs = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  let value = state.buckets.at(-1);
  if (!value || value.startedAtMs !== startedAtMs) {
    value = { startedAtMs, attempts: 0, successes: 0, failures: 0, totalDurationMs: 0, maxDurationMs: 0, workUnits: 0 };
    state.buckets.push(value);
  }
  while (state.buckets[0] && state.buckets[0].startedAtMs < now - WINDOW_MS) state.buckets.shift();
  return value;
}

function sum(state: LaneState, now: number, durationMs: number) {
  return state.buckets.filter((item) => item.startedAtMs >= now - durationMs).reduce((result, item) => ({
    attempts: result.attempts + item.attempts,
    successes: result.successes + item.successes,
    failures: result.failures + item.failures,
    totalDurationMs: result.totalDurationMs + item.totalDurationMs,
    maxDurationMs: Math.max(result.maxDurationMs, item.maxDurationMs),
    workUnits: result.workUnits + item.workUnits,
  }), { attempts: 0, successes: 0, failures: 0, totalDurationMs: 0, maxDurationMs: 0, workUnits: 0 });
}

export interface DbOperationDiagnosticsSnapshot {
  scope: "process-local";
  processId: number;
  diagnosticsStoreId: string;
  startedAt: string;
  uptimeSeconds: number;
  lanes: Record<DbOperationLane, { kind: DbOperationKind; operation: DbOperationType; autocommit: true; attempts: number; successes: number; failures: number; active: number; maxConcurrent: number; totalDurationMs: number; maxDurationMs: number; workUnits: number; windows: Record<"5m" | "15m" | "60m", ReturnType<typeof sum>> }>;
}

const metadata: Record<DbOperationLane, { kind: DbOperationKind; operation: DbOperationType }> = {
  "navigation.observation.create": { kind: "WRITE", operation: "INSERT" },
  "navigation.anomaly.upsert": { kind: "WRITE", operation: "UPSERT" },
  "navigation.history.query": { kind: "READ", operation: "SELECT" },
  "weather.observation.create": { kind: "WRITE", operation: "INSERT" },
  "weather.observation.query": { kind: "READ", operation: "SELECT" },
  "aircraft-metadata.cache.lookup": { kind: "READ", operation: "SELECT" },
  "receiver.reception-record.query": { kind: "READ", operation: "SELECT" },
  "atc.dataset.load": { kind: "READ", operation: "SELECT" },
  "system-status.db-health.query": { kind: "READ", operation: "SELECT" },
  "system-status.airport-count.query": { kind: "READ", operation: "SELECT" },
  "flight-intelligence.airport-index.query": { kind: "READ", operation: "SELECT" },
  "flight-intelligence.event.query": { kind: "READ", operation: "SELECT" },
  "flight-intelligence.flight-link.query": { kind: "READ", operation: "SELECT" },
  "flight-intelligence.event.create": { kind: "WRITE", operation: "INSERT" },
  "history.list.query": { kind: "READ", operation: "SELECT" },
  "history.flight-detail.query": { kind: "READ", operation: "SELECT" },
  "history.aircraft-quick.query": { kind: "READ", operation: "SELECT" },
  "history.aircraft-detail.query": { kind: "READ", operation: "SELECT" },
};

export async function trackDbOperation<T>(lane: DbOperationLane, operation: () => Promise<T>, workUnits = 1): Promise<T> {
  if (!laneSet.has(lane)) throw new Error(`Unknown DB operation diagnostics lane: ${lane}`);
  const state = getLane(lane);
  const started = Date.now();
  state.attempts += 1; state.active += 1; state.maxConcurrent = Math.max(state.maxConcurrent, state.active);
  let success = false;
  try { const result = await operation(); success = true; state.successes += 1; return result; }
  catch (error) { state.failures += 1; throw error; }
  finally {
    try {
      const duration = Math.max(0, Date.now() - started); state.active = Math.max(0, state.active - 1);
      state.totalDurationMs += duration; state.maxDurationMs = Math.max(state.maxDurationMs, duration);
      const current = bucket(state, Date.now()); current.attempts += 1; current.workUnits += Math.max(0, workUnits); current.totalDurationMs += duration; current.maxDurationMs = Math.max(current.maxDurationMs, duration); if (success) current.successes += 1; else current.failures += 1;
    } catch { /* diagnostics cannot change application behavior */ }
  }
}

export function getDbOperationDiagnostics(now = Date.now()): DbOperationDiagnosticsSnapshot {
  const lanes = {} as DbOperationDiagnosticsSnapshot["lanes"];
  for (const lane of DB_OPERATION_LANES) {
    const state = getLane(lane); while (state.buckets[0] && state.buckets[0].startedAtMs < now - WINDOW_MS) state.buckets.shift();
    lanes[lane] = { ...metadata[lane], autocommit: true, attempts: state.attempts, successes: state.successes, failures: state.failures, active: state.active, maxConcurrent: state.maxConcurrent, totalDurationMs: state.totalDurationMs, maxDurationMs: state.maxDurationMs, workUnits: state.workUnits, windows: { "5m": sum(state, now, 5 * 60_000), "15m": sum(state, now, 15 * 60_000), "60m": sum(state, now, 60 * 60_000) } };
  }
  return { scope: "process-local", processId: process.pid, diagnosticsStoreId: store.storeId, startedAt: new Date(store.startedAtMs).toISOString(), uptimeSeconds: Math.max(0, (now - store.startedAtMs) / 1000), lanes };
}

export function resetDbOperationDiagnosticsForTests(): void { store.lanes.clear(); }
