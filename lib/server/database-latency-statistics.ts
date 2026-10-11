import type { RuntimeTelemetrySample } from "@/lib/server/runtime-telemetry";

export type DatabaseLatencyWindow = {
  source: "runtime-telemetry-minute-probe";
  windowMinutes: number;
  sampleIntervalMs: 60_000;
  status: "measured" | "insufficient_data" | "disabled";
  sampleCount: number;
  failedSampleCount: number;
  disabledSampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  averageMs: number | null;
  maxMs: number | null;
  lastSampleAt: string | null;
};

/** Nearest-rank with no interpolation; null is intentional when there are no successful DB probes. */
function rank(sorted: readonly number[], proportion: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * proportion) - 1)] ?? null;
}

/**
 * Analyzes existing persisted minute probes, NOT synthetic Soak queries.
 * Failed and disabled probes are counted separately, never mistaken for zero-latency success.
 * No new DB I/O and no mutation of stored runtime telemetry.
 */
export function databaseLatencyWindow(
  samples: readonly Pick<RuntimeTelemetrySample, "recordedAt" | "databaseState" | "databaseLatencyMs">[],
  windowMinutes: number,
  nowMs: number = Date.now(),
): DatabaseLatencyWindow {
  const windowStart = nowMs - windowMinutes * 60_000;
  const latencies: number[] = [];
  let failedSampleCount = 0;
  let disabledSampleCount = 0;
  let lastSampleAt: string | null = null;
  let lastAt = -Infinity;
  for (const sample of samples) {
    const at = Date.parse(sample.recordedAt);
    if (!Number.isFinite(at) || at < windowStart || at > nowMs) continue;
    if (at > lastAt) { lastAt = at; lastSampleAt = sample.recordedAt; }
    if (sample.databaseState === "disabled") { disabledSampleCount++; continue; }
    if (sample.databaseState !== "ok"
      || sample.databaseLatencyMs === null
      || !Number.isFinite(sample.databaseLatencyMs)
      || sample.databaseLatencyMs < 0) {
      failedSampleCount++;
      continue;
    }
    latencies.push(sample.databaseLatencyMs);
  }
  latencies.sort((a, b) => a - b);
  const sampleCount = latencies.length;
  return {
    source: "runtime-telemetry-minute-probe",
    windowMinutes,
    sampleIntervalMs: 60_000,
    status: sampleCount ? "measured" : disabledSampleCount > 0 && !failedSampleCount ? "disabled" : "insufficient_data",
    sampleCount,
    failedSampleCount,
    disabledSampleCount,
    p50Ms: rank(latencies, 0.5),
    p95Ms: rank(latencies, 0.95),
    p99Ms: rank(latencies, 0.99),
    averageMs: sampleCount ? latencies.reduce((sum, x) => sum + x, 0) / sampleCount : null,
    maxMs: sampleCount ? latencies[sampleCount - 1] ?? null : null,
    lastSampleAt,
  };
}

export function databaseLatencySummary(
  samples: readonly Pick<RuntimeTelemetrySample, "recordedAt" | "databaseState" | "databaseLatencyMs">[],
  nowMs: number = Date.now(),
) {
  return {
    lastHour: databaseLatencyWindow(samples, 60, nowMs),
    last24Hours: databaseLatencyWindow(samples, 1_440, nowMs),
  };
}
