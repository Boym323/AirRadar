import { monitorEventLoopDelay, PerformanceObserver, constants } from "node:perf_hooks";

// Bounded measurements; no background timer, inspector, disk or database access.
// The Node bootstrap enables this by default and supports an explicit opt-out.
const MAX_GC_SAMPLES = 64;
type GcSample = { kind: number; durationMs: number };
let loop: ReturnType<typeof monitorEventLoopDelay> | null = null;
let observer: PerformanceObserver | null = null;
let gc: GcSample[] = [];
let gcCount = 0;
let gcPauseMs = 0;
let lastCpuUsage: NodeJS.CpuUsage | null = null;
let lastCpuAtNs: bigint | null = null;

function cpuSnapshot() {
  const usage = process.cpuUsage();
  const nowNs = process.hrtime.bigint();
  const previousUsage = lastCpuUsage;
  const previousAtNs = lastCpuAtNs;
  lastCpuUsage = usage;
  lastCpuAtNs = nowNs;
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
  if (loop) return;
  loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const detail = (entry as PerformanceEntry & { detail?: { kind?: number } }).detail;
      gc.push({ kind: detail?.kind ?? constants.NODE_PERFORMANCE_GC_MAJOR, durationMs: entry.duration });
      gcCount += 1;
      gcPauseMs += Math.max(0, entry.duration);
      if (gc.length > MAX_GC_SAMPLES) gc.shift();
    }
  });
  observer.observe({ entryTypes: ["gc"] });
}

export function stopRuntimeHealthObservation(): void {
  observer?.disconnect();
  observer = null;
  loop?.disable();
  loop = null;
  gc = [];
  gcCount = 0;
  gcPauseMs = 0;
  lastCpuUsage = null;
  lastCpuAtNs = null;
}

export function getRuntimeHealthObservation() {
  const mem = process.memoryUsage();
  const cpu = cpuSnapshot();
  return {
    status: loop ? "enabled" : "disabled",
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
    eventLoopLagP50Ms: loop ? Number((loop.percentile(50) / 1e6).toFixed(3)) : null,
    eventLoopLagP95Ms: loop ? Number((loop.percentile(95) / 1e6).toFixed(3)) : null,
    eventLoopLagP99Ms: loop ? Number((loop.percentile(99) / 1e6).toFixed(3)) : null,
    gcSampleCount: gc.length,
    gcCount,
    gcTotalPauseMs: gcPauseMs,
    gcMaxPauseMs: gc.length ? Math.max(...gc.map(x => x.durationMs)) : null,
    gcAveragePauseMs: gc.length ? gc.reduce((sum, x) => sum + x.durationMs, 0) / gc.length : null,
  };
}
