export interface RadarPerformanceSnapshot {
  enabled: true;
  sinceMs: number;
  animation: {
    frames: number;
    averageMs: number;
    maxMs: number;
    markerWrites: number;
    activeJobs: number;
    maxActiveJobs: number;
  };
  labelCollision: {
    runs: number;
    averageMs: number;
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
    maxMs: number;
  };
}

interface RadarPerformanceState {
  startedAt: number;
  animationFrames: number;
  animationTotalMs: number;
  animationMaxMs: number;
  markerWrites: number;
  activeJobs: number;
  maxActiveJobs: number;
  collisionRuns: number;
  collisionTotalMs: number;
  collisionMaxMs: number;
  trafficRows: number;
  renderedTrafficRows: number;
  trafficVirtualized: boolean;
  longTasks: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
}

declare global {
  interface Window {
    __airradarPerformanceDiagnostics?: {
      snapshot: () => RadarPerformanceSnapshot;
      reset: () => void;
    };
  }
}

let activeState: RadarPerformanceState | null = null;

function createState(): RadarPerformanceState {
  return {
    startedAt: Date.now(),
    animationFrames: 0,
    animationTotalMs: 0,
    animationMaxMs: 0,
    markerWrites: 0,
    activeJobs: 0,
    maxActiveJobs: 0,
    collisionRuns: 0,
    collisionTotalMs: 0,
    collisionMaxMs: 0,
    trafficRows: 0,
    renderedTrafficRows: 0,
    trafficVirtualized: false,
    longTasks: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,
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
      maxMs: state.animationMaxMs,
      markerWrites: state.markerWrites,
      activeJobs: state.activeJobs,
      maxActiveJobs: state.maxActiveJobs,
    },
    labelCollision: {
      runs: state.collisionRuns,
      averageMs: state.collisionRuns > 0 ? state.collisionTotalMs / state.collisionRuns : 0,
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
      maxMs: state.longTaskMaxMs,
    },
  };
}

export function startRadarPerformanceDiagnostics(search: string): () => void {
  if (typeof window === "undefined" || new URLSearchParams(search).get("perfDiagnostics") !== "1") return () => {};

  activeState = createState();
  const api = {
    snapshot: currentSnapshot,
    reset: () => { activeState = createState(); },
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
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  }

  return () => {
    observer?.disconnect();
    if (window.__airradarPerformanceDiagnostics === api) delete window.__airradarPerformanceDiagnostics;
    activeState = null;
  };
}

export function recordRadarAnimationFrame(durationMs: number, markerWrites: number, activeJobs: number): void {
  const state = activeState;
  if (!state) return;
  state.animationFrames += 1;
  state.animationTotalMs += durationMs;
  state.animationMaxMs = Math.max(state.animationMaxMs, durationMs);
  state.markerWrites += markerWrites;
  state.activeJobs = activeJobs;
  state.maxActiveJobs = Math.max(state.maxActiveJobs, activeJobs);
}

export function recordRadarLabelCollision(durationMs: number): void {
  const state = activeState;
  if (!state) return;
  state.collisionRuns += 1;
  state.collisionTotalMs += durationMs;
  state.collisionMaxMs = Math.max(state.collisionMaxMs, durationMs);
}

export function recordRadarTrafficList(totalRows: number, renderedRows: number, virtualized: boolean): void {
  const state = activeState;
  if (!state) return;
  state.trafficRows = totalRows;
  state.renderedTrafficRows = renderedRows;
  state.trafficVirtualized = virtualized;
}
