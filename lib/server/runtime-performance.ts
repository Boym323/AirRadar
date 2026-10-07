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
      return { calls: 0, totalMs: 0, maxMs: 0, processedAircraft: 0, samplesMs: [], sampleCursor: 0 };
    }
    value = { calls: 0, totalMs: 0, maxMs: 0, processedAircraft: 0, samplesMs: [], sampleCursor: 0 };
    metrics.set(name, value);
  } else if (!Number.isInteger(value.sampleCursor)) {
    // Preserve compatibility with process-local state created by the previous
    // implementation during a hot reload.
    value.sampleCursor = 0;
  }
  return value;
}

function record(name: string, durationMs: number, processedAircraft: number): void {
  const value = metric(name);
  value.calls += 1;
  value.totalMs += durationMs;
  value.maxMs = Math.max(value.maxMs, durationMs);
  value.processedAircraft += Math.max(0, processedAircraft);
  if (value.samplesMs.length < MAX_SAMPLES) {
    value.samplesMs.push(durationMs);
    return;
  }
  value.samplesMs[value.sampleCursor] = durationMs;
  value.sampleCursor = (value.sampleCursor + 1) % MAX_SAMPLES;
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

function orderedSamples(value: RuntimePerformanceMetricState): number[] {
  if (value.samplesMs.length < MAX_SAMPLES || value.sampleCursor === 0) return value.samplesMs.slice();
  return [
    ...value.samplesMs.slice(value.sampleCursor),
    ...value.samplesMs.slice(0, value.sampleCursor),
  ];
}

function percentile(sortedSamples: readonly number[], fraction: number): number {
  if (!sortedSamples.length) return 0;
  return sortedSamples[Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * fraction) - 1)] ?? 0;
}

export function getRuntimePerformanceDiagnostics(): Record<string, RuntimePerformanceMetric & { avgMs: number; p50Ms: number; p95Ms: number; p99Ms: number }> {
  return Object.fromEntries([...metrics.entries()].map(([name, value]) => {
    const samplesMs = orderedSamples(value);
    const sortedSamples = [...samplesMs].sort((left, right) => left - right);
    return [name, {
      calls: value.calls,
      totalMs: value.totalMs,
      maxMs: value.maxMs,
      processedAircraft: value.processedAircraft,
      avgMs: value.calls ? value.totalMs / value.calls : 0,
      p50Ms: percentile(sortedSamples, 0.5),
      p95Ms: percentile(sortedSamples, 0.95),
      p99Ms: percentile(sortedSamples, 0.99),
      samplesMs,
    }];
  }));
}

export function resetRuntimePerformanceDiagnosticsForTests(): void {
  metrics.clear();
}
