import { monitorEventLoopDelay, PerformanceObserver, constants } from "node:perf_hooks";

// Opt-in bounded measurements; no background timer, inspector, disk or database access.
const MAX_GC_SAMPLES = 64;
type GcSample = { kind: number; durationMs: number };
let loop: ReturnType<typeof monitorEventLoopDelay> | null = null;
let observer: PerformanceObserver | null = null;
let gc: GcSample[] = [];

export function startRuntimeHealthObservation(): void {
  if (loop) return;
  loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const detail = (entry as PerformanceEntry & { detail?: { kind?: number } }).detail;
      gc.push({ kind: detail?.kind ?? constants.NODE_PERFORMANCE_GC_MAJOR, durationMs: entry.duration });
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
}

export function getRuntimeHealthObservation() {
  const mem = process.memoryUsage();
  return {
    status: loop ? "enabled" : "disabled",
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    rssBytes: mem.rss,
    eventLoopLagP50Ms: loop ? Number((loop.percentile(50) / 1e6).toFixed(3)) : null,
    eventLoopLagP95Ms: loop ? Number((loop.percentile(95) / 1e6).toFixed(3)) : null,
    eventLoopLagP99Ms: loop ? Number((loop.percentile(99) / 1e6).toFixed(3)) : null,
    gcSampleCount: gc.length,
    gcMaxPauseMs: gc.length ? Math.max(...gc.map(x => x.durationMs)) : null,
    gcAveragePauseMs: gc.length ? gc.reduce((sum, x) => sum + x.durationMs, 0) / gc.length : null,
  };
}
