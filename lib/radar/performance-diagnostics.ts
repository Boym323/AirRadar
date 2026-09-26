export interface RadarPerformanceSnapshot {
  enabled: true;
  sinceMs: number;
  animation: {
    frames: number;
    averageMs: number;
    p95Ms: number;
    maxMs: number;
    frameIntervalP95Ms: number;
    markerWrites: number;
    activeJobs: number;
    maxActiveJobs: number;
  };
  labelCollision: {
    runs: number;
    averageMs: number;
    p95Ms: number;
    maxMs: number;
  };
  trafficList: {
    totalRows: number;
    renderedRows: number;
    virtualized: boolean;
  };
  longTasks: {
    count: number;
    totalMs: number;
    p95Ms: number;
    maxMs: number;
  };
}

interface RadarPerformanceState {
  startedAt: number;
  animationFrames: number;
  animationTotalMs: number;
  animationMaxMs: number;
  animationSamples: number[];
  frameIntervalSamples: number[];
  lastAnimationRecordedAt: number | null;
  markerWrites: number;
  activeJobs: number;
  maxActiveJobs: number;
  collisionRuns: number;
  collisionTotalMs: number;
  collisionMaxMs: number;
  collisionSamples: number[];
  trafficRows: number;
  renderedTrafficRows: number;
  trafficVirtualized: boolean;
  longTasks: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  longTaskSamples: number[];
}

declare global {
  interface Window {
    __airradarPerformanceDiagnostics?: {
      snapshot: () => RadarPerformanceSnapshot;
      reset: () => void;
      recordTrafficList: (totalRows: number, renderedRows: number, virtualized: boolean) => void;
    };
  }
}

const MAX_DIAGNOSTIC_SAMPLES = 4096;

function recordSample(samples: number[], value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  if (samples.length >= MAX_DIAGNOSTIC_SAMPLES) samples.shift();
  samples.push(value);
}

export function percentile95(samples: readonly number[]): number {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

let activeState: RadarPerformanceState | null = null;

function createState(): RadarPerformanceState {
  return {
    startedAt: Date.now(),
    animationFrames: 0,
    animationTotalMs: 0,
    animationMaxMs: 0,
    animationSamples: [],
    frameIntervalSamples: [],
    lastAnimationRecordedAt: null,
    markerWrites: 0,
    activeJobs: 0,
    maxActiveJobs: 0,
    collisionRuns: 0,
    collisionTotalMs: 0,
    collisionMaxMs: 0,
    collisionSamples: [],
    trafficRows: 0,
    renderedTrafficRows: 0,
    trafficVirtualized: false,
    longTasks: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,
    longTaskSamples: [],
  };
}

function currentSnapshot(): RadarPerformanceSnapshot {
  const state = activeState ?? createState();
  return {
    enabled: true,
    sinceMs: Math.max(0, Date.now() - state.startedAt),
    animation: {
      frames: state.animationFrames,
      averageMs: state.animationFrames > 0 ? state.animationTotalMs / state.animationFrames : 0,
      p95Ms: percentile95(state.animationSamples),
      maxMs: state.animationMaxMs,
      frameIntervalP95Ms: percentile95(state.frameIntervalSamples),
      markerWrites: state.markerWrites,
      activeJobs: state.activeJobs,
      maxActiveJobs: state.maxActiveJobs,
    },
    labelCollision: {
      runs: state.collisionRuns,
      averageMs: state.collisionRuns > 0 ? state.collisionTotalMs / state.collisionRuns : 0,
      p95Ms: percentile95(state.collisionSamples),
      maxMs: state.collisionMaxMs,
    },
    trafficList: {
      totalRows: state.trafficRows,
      renderedRows: state.renderedTrafficRows,
      virtualized: state.trafficVirtualized,
    },
    longTasks: {
      count: state.longTasks,
      totalMs: state.longTaskTotalMs,
      p95Ms: percentile95(state.longTaskSamples),
      maxMs: state.longTaskMaxMs,
    },
  };
}

export interface RadarPerformanceDiagnosticsSession {
  recordAnimationFrame: (durationMs: number, markerWrites: number, activeJobs: number) => void;
  recordLabelCollision: (durationMs: number) => void;
  stop: () => void;
}

export function startRadarPerformanceDiagnostics(search: string): RadarPerformanceDiagnosticsSession | null {
  if (typeof window === "undefined" || new URLSearchParams(search).get("perfDiagnostics") !== "1") return null;

  activeState = createState();
  const api = {
    snapshot: currentSnapshot,
    reset: () => { activeState = createState(); },
    recordTrafficList: (totalRows: number, renderedRows: number, virtualized: boolean) => {
      const state = activeState;
      if (!state) return;
      state.trafficRows = totalRows;
      state.renderedTrafficRows = renderedRows;
      state.trafficVirtualized = virtualized;
    },
  };
  window.__airradarPerformanceDiagnostics = api;

  let observer: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
    observer = new PerformanceObserver((list) => {
      const state = activeState;
      if (!state) return;
      for (const entry of list.getEntries()) {
        state.longTasks += 1;
        state.longTaskTotalMs += entry.duration;
        state.longTaskMaxMs = Math.max(state.longTaskMaxMs, entry.duration);
        recordSample(state.longTaskSamples, entry.duration);
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  }

  return {
    recordAnimationFrame: (durationMs, markerWrites, activeJobs) => {
      const state = activeState;
      if (!state) return;
      const recordedAt = performance.now();
      if (state.lastAnimationRecordedAt !== null) {
        recordSample(state.frameIntervalSamples, recordedAt - state.lastAnimationRecordedAt);
      }
      state.lastAnimationRecordedAt = recordedAt;
      state.animationFrames += 1;
      state.animationTotalMs += durationMs;
      state.animationMaxMs = Math.max(state.animationMaxMs, durationMs);
      recordSample(state.animationSamples, durationMs);
      state.markerWrites += markerWrites;
      state.activeJobs = activeJobs;
      state.maxActiveJobs = Math.max(state.maxActiveJobs, activeJobs);
    },
    recordLabelCollision: (durationMs) => {
      const state = activeState;
      if (!state) return;
      state.collisionRuns += 1;
      state.collisionTotalMs += durationMs;
      state.collisionMaxMs = Math.max(state.collisionMaxMs, durationMs);
      recordSample(state.collisionSamples, durationMs);
    },
    stop: () => {
      observer?.disconnect();
      if (window.__airradarPerformanceDiagnostics === api) delete window.__airradarPerformanceDiagnostics;
      activeState = null;
    },
  };
}

