import { performance } from "node:perf_hooks";

const MAX_SAMPLES = 128;
const MAX_METRICS = 32;

export type RuntimePerformanceMetric = {
  calls: number;
  totalMs: number;
  maxMs: number;
  processedAircraft: number;
  samplesMs: number[];
};

const globalStore = globalThis as typeof globalThis & {
  __airRadarRuntimePerformance?: Map<string, RuntimePerformanceMetric>;
};
const metrics = globalStore.__airRadarRuntimePerformance ??= new Map();

function metric(name: string): RuntimePerformanceMetric {
  let value = metrics.get(name);
  if (!value) {
    if (metrics.size >= MAX_METRICS) return { calls: 0, totalMs: 0, maxMs: 0, processedAircraft: 0, samplesMs: [] };
    value = { calls: 0, totalMs: 0, maxMs: 0, processedAircraft: 0, samplesMs: [] };
    metrics.set(name, value);
  }
  return value;
}

function record(name: string, durationMs: number, processedAircraft: number): void {
  const value = metric(name);
  value.calls += 1;
  value.totalMs += durationMs;
  value.maxMs = Math.max(value.maxMs, durationMs);
  value.processedAircraft += Math.max(0, processedAircraft);
  value.samplesMs.push(durationMs);
  if (value.samplesMs.length > MAX_SAMPLES) value.samplesMs.shift();
}

export function measureRuntime<T>(name: string, processedAircraft: number, operation: () => T): T {
  const started = performance.now();
  try {
    return operation();
  } finally {
    record(name, Math.max(0, performance.now() - started), processedAircraft);
  }
}

export async function measureRuntimeAsync<T>(name: string, processedAircraft: number, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    record(name, Math.max(0, performance.now() - started), processedAircraft);
  }
}

function percentile(samples: number[], fraction: number): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

export function getRuntimePerformanceDiagnostics(): Record<string, RuntimePerformanceMetric & { avgMs: number; p50Ms: number; p95Ms: number; p99Ms: number }> {
  return Object.fromEntries([...metrics.entries()].map(([name, value]) => ({
    name,
    ...value,
    avgMs: value.calls ? value.totalMs / value.calls : 0,
    p50Ms: percentile(value.samplesMs, 0.5),
    p95Ms: percentile(value.samplesMs, 0.95),
    p99Ms: percentile(value.samplesMs, 0.99),
    samplesMs: value.samplesMs.slice(),
  })).map(({ name, ...value }) => [name, value]));
}

export function resetRuntimePerformanceDiagnosticsForTests(): void {
  metrics.clear();
}
