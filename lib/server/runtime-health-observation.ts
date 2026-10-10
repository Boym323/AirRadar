import { monitorEventLoopDelay, PerformanceObserver, constants } from "node:perf_hooks";
import { getHeapSpaceStatistics } from "node:v8";

// Bounded measurements; no background timer, inspector, disk or database access.
// The Node bootstrap enables this by default and supports an explicit opt-out.
const MAX_GC_SAMPLES = 64;
const MAX_HEAP_SPACES = 16;
const EVENT_LOOP_WINDOW_MS = 60_000;
const MAX_EVENT_LOOP_WINDOWS = 15;
const SAFE_SPACE_NAME = /^[a-z_]{1,48}$/;
export type V8HeapSpaceSample = {
  name: string;
  usedBytes: number;
  sizeBytes: number;
  availableBytes: number;
  physicalBytes: number;
};
type PostMajorGcMemory = {
  observedAtMs: number;
  heapUsedBytes: number;
  rssBytes: number;
  oldSpaceUsedBytes: number | null;
};

/** Only bounded V8 totals; never object graphs, strings, heap snapshots or retainers. */
export function getV8HeapSpaces(): V8HeapSpaceSample[] {
  return getHeapSpaceStatistics()
    .filter((space) => SAFE_SPACE_NAME.test(space.space_name))
    .slice(0, MAX_HEAP_SPACES)
    .map((space) => ({
      name: space.space_name,
      usedBytes: Math.max(0, space.space_used_size),
      sizeBytes: Math.max(0, space.space_size),
      availableBytes: Math.max(0, space.space_available_size),
      physicalBytes: Math.max(0, space.physical_space_size),
    }));
}
type GcSample = { kind: number; durationMs: number };
type RuntimeHealthState = {
  loop: ReturnType<typeof monitorEventLoopDelay> | null;
  observer: PerformanceObserver | null;
  gc: GcSample[];
  gcCount: number;
  gcPauseMs: number;
  majorGcCount?: number;
  lastPostMajorGc?: PostMajorGcMemory | null;
  lastCpuUsage: NodeJS.CpuUsage | null;
  lastCpuAtNs: bigint | null;
  windowTimer: ReturnType<typeof setInterval> | null;
  eventLoopWindows: Array<{ from: string; to: string; p95Ms: number; p99Ms: number; maxMs: number }>;
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
  majorGcCount: 0,
  lastPostMajorGc: null,
  lastCpuUsage: null,
  lastCpuAtNs: null,
  windowTimer: null,
  eventLoopWindows: [],
};

function captureEventLoopWindow(): void {
  if (!state.loop) return;
  const now = Date.now();
  state.eventLoopWindows.push({
    from: new Date(now - EVENT_LOOP_WINDOW_MS).toISOString(),
    to: new Date(now).toISOString(),
    p95Ms: Number((state.loop.percentile(95) / 1e6).toFixed(3)),
    p99Ms: Number((state.loop.percentile(99) / 1e6).toFixed(3)),
    maxMs: Number((state.loop.max / 1e6).toFixed(3)),
  });
  if (state.eventLoopWindows.length > MAX_EVENT_LOOP_WINDOWS) state.eventLoopWindows.shift();
  state.loop.reset();
}

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
      const legacyKind = (entry as PerformanceEntry & { kind?: number }).kind;
      const kind = detail?.kind ?? legacyKind ?? 0;
      state.gc.push({ kind, durationMs: entry.duration });
      state.gcCount += 1;
      state.gcPauseMs += Math.max(0, entry.duration);
      if (state.gc.length > MAX_GC_SAMPLES) state.gc.shift();
      // The callback is asynchronous and may observe allocations after GC.
      // Treat this as an approximate post-major-GC baseline, not a retainer
      // measurement or proof of a memory leak.
      if (kind === constants.NODE_PERFORMANCE_GC_MAJOR) {
        state.majorGcCount = (state.majorGcCount ?? 0) + 1;
        try {
          const mem = process.memoryUsage();
          const oldSpace = getV8HeapSpaces().find((space) => space.name === "old_space");
          state.lastPostMajorGc = {
            observedAtMs: Date.now(),
            heapUsedBytes: mem.heapUsed,
            rssBytes: mem.rss,
            oldSpaceUsedBytes: oldSpace?.usedBytes ?? null,
          };
        } catch {
          // Diagnostics must never interrupt aircraft collection.
        }
      }
    }
  });
  state.observer.observe({ entryTypes: ["gc"] });
  state.windowTimer = setInterval(captureEventLoopWindow, EVENT_LOOP_WINDOW_MS);
  state.windowTimer.unref?.();
}

export function stopRuntimeHealthObservation(): void {
  state.observer?.disconnect();
  state.observer = null;
  state.loop?.disable();
  state.loop = null;
  if (state.windowTimer) clearInterval(state.windowTimer);
  state.windowTimer = null;
  state.eventLoopWindows = [];
  state.gc = [];
  state.gcCount = 0;
  state.gcPauseMs = 0;
  state.majorGcCount = 0;
  state.lastPostMajorGc = null;
  state.lastCpuUsage = null;
  state.lastCpuAtNs = null;
}

export function getRuntimeHealthObservation() {
  const mem = process.memoryUsage();
  const cpu = cpuSnapshot();
  return {
    status: state.loop ? "enabled" : "disabled",
    v8HeapSpaces: getV8HeapSpaces(),
    majorGcCount: state.majorGcCount ?? 0,
    postMajorGc: state.lastPostMajorGc ?? null,
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
    eventLoopLagWindows: state.eventLoopWindows.map((window) => ({ ...window })),
    gcSampleCount: state.gc.length,
    gcCount: state.gcCount,
    gcTotalPauseMs: state.gcPauseMs,
    gcMaxPauseMs: state.gc.length ? Math.max(...state.gc.map(x => x.durationMs)) : null,
    gcAveragePauseMs: state.gc.length ? state.gc.reduce((sum, x) => sum + x.durationMs, 0) / state.gc.length : null,
  };
}
