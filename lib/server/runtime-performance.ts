import { performance } from "node:perf_hooks";
import { recordRuntimeSlowSyncSpan } from "@/lib/server/runtime-stall-evidence";

const MAX_SAMPLES = 128;
// Bounded headroom for dedicated Twin validator scopes alongside existing health metrics.
const MAX_METRICS = 48;
const WINDOW_MS = 60_000;
const MAX_WINDOWS = 15;
const MAX_WINDOW_SAMPLES = 64;

export type RuntimePerformanceWindow = {
  from: string;
  to: string;
  calls: number;
  p95Ms: number;
  p99Ms: number;
  cpuMs: number;
  waitMs: number;
};

export type RuntimePerformanceMetric = {
  calls: number;
  totalMs: number;
  maxMs: number;
  processedAircraft: number;
  samplesMs: number[];
  cpuMs: number;
  waitMs: number;
  /** Current and peak overlapping async executions; lifetime counters, not CPU usage. */
  activeAsync: number;
  maxConcurrentAsync: number;
  windows: Array<RuntimePerformanceWindow & { samplesMs: number[] }>;
};

type RuntimePerformanceMetricState = RuntimePerformanceMetric & {
  sampleCursor: number;
};

const globalStore = globalThis as typeof globalThis & {
  __airRadarRuntimePerformance?: Map<string, RuntimePerformanceMetricState>;
};
const metrics = globalStore.__airRadarRuntimePerformance ??= new Map();

function metric(name: string): RuntimePerformanceMetricState {
  let value = metrics.get(name);
  if (!value) {
    if (metrics.size >= MAX_METRICS) {
      return emptyMetric();
    }
    value = emptyMetric();
    metrics.set(name, value);
  } else if (!Number.isInteger(value.sampleCursor)) {
    // Preserve compatibility with process-local state created by the previous
    // implementation during a hot reload.
    value.sampleCursor = 0;
  }
  value.cpuMs ??= 0;
  value.waitMs ??= 0;
  value.activeAsync ??= 0;
  value.maxConcurrentAsync ??= 0;
  value.windows ??= [];
  return value;
}

function emptyMetric(): RuntimePerformanceMetricState {
  return { calls: 0, totalMs: 0, maxMs: 0, processedAircraft: 0, samplesMs: [], sampleCursor: 0, cpuMs: 0, waitMs: 0, activeAsync: 0, maxConcurrentAsync: 0, windows: [] };
}

function percentile(sortedSamples: readonly number[], fraction: number): number {
  if (!sortedSamples.length) return 0;
  return sortedSamples[Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * fraction) - 1)] ?? 0;
}

function record(name: string, durationMs: number, processedAircraft: number, cpuMs: number): void {
  const value = metric(name);
  value.calls += 1;
  value.totalMs += durationMs;
  value.maxMs = Math.max(value.maxMs, durationMs);
  value.processedAircraft += Math.max(0, processedAircraft);
  const boundedCpuMs = Math.min(durationMs, Math.max(0, cpuMs));
  value.cpuMs += boundedCpuMs;
  value.waitMs += Math.max(0, durationMs - boundedCpuMs);
  if (value.samplesMs.length < MAX_SAMPLES) {
    value.samplesMs.push(durationMs);
  } else {
    value.samplesMs[value.sampleCursor] = durationMs;
    value.sampleCursor = (value.sampleCursor + 1) % MAX_SAMPLES;
  }

  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  value.windows ??= [];
  let window = value.windows[value.windows.length - 1];
  if (!window || Date.parse(window.from) !== windowStart) {
    window = { from: new Date(windowStart).toISOString(), to: new Date(windowStart + WINDOW_MS).toISOString(), calls: 0, p95Ms: 0, p99Ms: 0, cpuMs: 0, waitMs: 0, samplesMs: [] };
    value.windows.push(window);
    if (value.windows.length > MAX_WINDOWS) value.windows.shift();
  }
  window.calls += 1;
  window.cpuMs += boundedCpuMs;
  window.waitMs += Math.max(0, durationMs - boundedCpuMs);
  if (window.samplesMs.length < MAX_WINDOW_SAMPLES) window.samplesMs.push(durationMs);
  else window.samplesMs[window.calls % MAX_WINDOW_SAMPLES] = durationMs;
  // T5.8A: never sort on this hot path. snapshot.trail-update alone
  // records millions of samples per soak. Compute percentiles when the
  // diagnostic endpoint is actually read (once per minute by the sampler).
}

export function measureRuntime<T>(name: string, processedAircraft: number | (() => number), operation: () => T): T {
  const started = performance.now();
  try {
    return operation();
  } finally {
    const ended = performance.now();
    const durationMs = Math.max(0, ended - started);
    // This is an inclusive synchronous wall-time proxy. Nested scopes
    // overlap and must never be summed as exclusive process CPU.
    record(name, durationMs, typeof processedAircraft === "function" ? processedAircraft() : processedAircraft, durationMs);
    // Millions of tiny trail-update calls must not pay for diagnostics.
    if (durationMs >= 25) recordRuntimeSlowSyncSpan(name, started, ended);
  }
}

export async function measureRuntimeAsync<T>(name: string, processedAircraft: number, operation: () => Promise<T>): Promise<T> {
  const state = metric(name);
  state.activeAsync += 1;
  state.maxConcurrentAsync = Math.max(state.maxConcurrentAsync, state.activeAsync);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  try {
    return await operation();
  } finally {
    const durationMs = Math.max(0, performance.now() - started);
    const cpu = process.cpuUsage(cpuStarted);
    state.activeAsync = Math.max(0, state.activeAsync - 1);
    // process.cpuUsage() covers ALL process activity while this promise was
    // pending; overlapping async calls double-count. Preserve the legacy
    // approximate metric for compatibility, but expose the overlap.
    record(name, durationMs, processedAircraft, (cpu.user + cpu.system) / 1_000);
  }
}

function orderedSamples(value: RuntimePerformanceMetricState): number[] {
  if (value.samplesMs.length < MAX_SAMPLES || value.sampleCursor === 0) return value.samplesMs.slice();
  return [
    ...value.samplesMs.slice(value.sampleCursor),
    ...value.samplesMs.slice(0, value.sampleCursor),
  ];
}

export function getRuntimePerformanceDiagnostics(): Record<string, RuntimePerformanceMetric & { avgMs: number; p50Ms: number; p95Ms: number; p99Ms: number; cpuAttribution: "inclusive-process-overlap" }> {
  return Object.fromEntries([...metrics.entries()].map(([name, value]) => {
    const samplesMs = orderedSamples(value);
    const sortedSamples = [...samplesMs].sort((left, right) => left - right);
    return [name, {
      /** In-flight work is observed, not an estimate of exclusive CPU. */
      activeAsync: value.activeAsync ?? 0,
      maxConcurrentAsync: value.maxConcurrentAsync ?? 0,
      cpuAttribution: "inclusive-process-overlap" as const,
      calls: value.calls,
      totalMs: value.totalMs,
      maxMs: value.maxMs,
      processedAircraft: value.processedAircraft,
      cpuMs: value.cpuMs,
      waitMs: value.waitMs,
      avgMs: value.calls ? value.totalMs / value.calls : 0,
      p50Ms: percentile(sortedSamples, 0.5),
      p95Ms: percentile(sortedSamples, 0.95),
      p99Ms: percentile(sortedSamples, 0.99),
      samplesMs,
      windows: value.windows.map((window: RuntimePerformanceWindow & { samplesMs: number[] }) => {
        const sorted = [...window.samplesMs].sort((a, b) => a - b);
        return { ...window, p95Ms: percentile(sorted, 0.95), p99Ms: percentile(sorted, 0.99),
          samplesMs: window.samplesMs.slice() };
      }),
    }];
  }));
}

export function resetRuntimePerformanceDiagnosticsForTests(): void {
  metrics.clear();
}
