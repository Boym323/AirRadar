import { monitorEventLoopDelay, PerformanceObserver, constants } from "node:perf_hooks";

// Bounded measurements; no background timer, inspector, disk or database access.
// The Node bootstrap enables this by default and supports an explicit opt-out.
const MAX_GC_SAMPLES = 64;
type GcSample = { kind: number; durationMs: number };
type RuntimeHealthState = {
  loop: ReturnType<typeof monitorEventLoopDelay> | null;
  observer: PerformanceObserver | null;
  gc: GcSample[];
  gcCount: number;
  gcPauseMs: number;
  lastCpuUsage: NodeJS.CpuUsage | null;
  lastCpuAtNs: bigint | null;
};

// Next standalone builds can evaluate instrumentation and route modules in
// separate bundles. Keep the observation state on the process global so the
// startup hook and /api/system/runtime-performance always see the same
// monitor, observer and cumulative counters.
const processGlobal = globalThis as typeof globalThis & {
  __airRadarRuntimeHealthObservation?: RuntimeHealthState;
};
const state = processGlobal.__airRadarRuntimeHealthObservation ??= {
  loop: null,
  observer: null,
  gc: [],
  gcCount: 0,
  gcPauseMs: 0,
  lastCpuUsage: null,
  lastCpuAtNs: null,
};

function cpuSnapshot() {
  const usage = process.cpuUsage();
  const nowNs = process.hrtime.bigint();
  const previousUsage = state.lastCpuUsage;
  const previousAtNs = state.lastCpuAtNs;
  state.lastCpuUsage = usage;
  state.lastCpuAtNs = nowNs;
  const userTimeMs = usage.user / 1_000;
  const systemTimeMs = usage.system / 1_000;
  if (!previousUsage || previousAtNs === null) {
    return { userTimeMs, systemTimeMs, intervalUserTimeMs: null, intervalSystemTimeMs: null, intervalCpuPercent: null };
  }
  const elapsedMs = Number(nowNs - previousAtNs) / 1e6;
  const intervalUserTimeMs = Math.max(0, (usage.user - previousUsage.user) / 1_000);
  const intervalSystemTimeMs = Math.max(0, (usage.system - previousUsage.system) / 1_000);
  const configuredCpuCount = Number(process.env.AIRRADAR_CPU_COUNT);
  const cpuCount = Number.isFinite(configuredCpuCount) && configuredCpuCount >= 1 ? Math.min(256, configuredCpuCount) : 1;
  const intervalCpuPercent = elapsedMs > 0
    ? Math.min(100 * Math.max(0, (intervalUserTimeMs + intervalSystemTimeMs) / elapsedMs), 100 * cpuCount)
    : null;
  return { userTimeMs, systemTimeMs, intervalUserTimeMs, intervalSystemTimeMs, intervalCpuPercent };
}

export function startRuntimeHealthObservation(): void {
  if (process.env.AIRRADAR_RUNTIME_HEALTH_OBSERVATION?.trim().toLowerCase() === "false") return;
  if (state.loop) return;
  state.loop = monitorEventLoopDelay({ resolution: 20 });
  state.loop.enable();
  state.observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const detail = (entry as PerformanceEntry & { detail?: { kind?: number } }).detail;
      state.gc.push({ kind: detail?.kind ?? constants.NODE_PERFORMANCE_GC_MAJOR, durationMs: entry.duration });
      state.gcCount += 1;
      state.gcPauseMs += Math.max(0, entry.duration);
      if (state.gc.length > MAX_GC_SAMPLES) state.gc.shift();
    }
  });
  state.observer.observe({ entryTypes: ["gc"] });
}

export function stopRuntimeHealthObservation(): void {
  state.observer?.disconnect();
  state.observer = null;
  state.loop?.disable();
  state.loop = null;
  state.gc = [];
  state.gcCount = 0;
  state.gcPauseMs = 0;
  state.lastCpuUsage = null;
  state.lastCpuAtNs = null;
}

export function getRuntimeHealthObservation() {
  const mem = process.memoryUsage();
  const cpu = cpuSnapshot();
  return {
    status: state.loop ? "enabled" : "disabled",
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    rssBytes: mem.rss,
    externalBytes: mem.external,
    arrayBuffersBytes: mem.arrayBuffers,
    cpuUserTimeMs: cpu.userTimeMs,
    cpuSystemTimeMs: cpu.systemTimeMs,
    cpuIntervalUserTimeMs: cpu.intervalUserTimeMs,
    cpuIntervalSystemTimeMs: cpu.intervalSystemTimeMs,
    cpuIntervalPercent: cpu.intervalCpuPercent,
    eventLoopLagP50Ms: state.loop ? Number((state.loop.percentile(50) / 1e6).toFixed(3)) : null,
    eventLoopLagP95Ms: state.loop ? Number((state.loop.percentile(95) / 1e6).toFixed(3)) : null,
    eventLoopLagP99Ms: state.loop ? Number((state.loop.percentile(99) / 1e6).toFixed(3)) : null,
    gcSampleCount: state.gc.length,
    gcCount: state.gcCount,
    gcTotalPauseMs: state.gcPauseMs,
    gcMaxPauseMs: state.gc.length ? Math.max(...state.gc.map(x => x.durationMs)) : null,
    gcAveragePauseMs: state.gc.length ? state.gc.reduce((sum, x) => sum + x.durationMs, 0) / state.gc.length : null,
  };
}
