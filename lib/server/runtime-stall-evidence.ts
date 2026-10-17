import { performance } from "node:perf_hooks";
import { getRuntimeGcTotals } from "@/lib/server/runtime-health-observation";

// Deliberately not an inspector or profiler: only bounded timing summaries,
// never payloads, flight identities, stack traces or callback arguments.
export const STALL_HEARTBEAT_MS = 1_000;
export const STALL_THRESHOLD_MS = 1_000;
const SLOW_SCOPE_MS = 25;
const MAX_SPANS = 64;
const MAX_EVENTS = 24;
const SPAN_RETENTION_MS = 10_000;
// The scope name must be code-defined, not a request-dependent string.
const SAFE_SCOPE = /^(?:snapshot|twin|history|network|health|atc|routeCache)\.[a-z][a-zA-Z0-9.-]{0,64}$/;

type SyncSpan = {
  name: string;
  startedMs: number;
  endedMs: number;
  durationMs: number;
};

export interface RuntimeStallEvent {
  observedAt: string;
  overshootMs: number;
  intervalMs: number;
  intervalCpuPercent: number | null;
  /** Approximate temporal context from asynchronous GC notifications. */
  intervalGcPauseMs: number | null;
  intervalGcCount: number | null;
  intervalMajorGcCount: number | null;
  /** Node event-loop utilization deltas, NOT exclusive process CPU. */
  intervalEventLoopActiveMs: number | null;
  intervalEventLoopIdleMs: number | null;
  correlatedScope: { name: string; durationMs: number; overlapMs: number } | null;
  /** A temporal overlap is NOT proof of the stall's root cause. */
  attribution: "temporal-overlap-only" | "unattributed";
}

export class RuntimeStallEvidenceRecorder {
  private spans: SyncSpan[] = [];
  private events: RuntimeStallEvent[] = [];
  private total = 0;

  recordSync(name: string, startedMs: number, endedMs: number): void {
    if (!SAFE_SCOPE.test(name) || !Number.isFinite(startedMs) || !Number.isFinite(endedMs)) return;
    const durationMs = endedMs - startedMs;
    if (durationMs < SLOW_SCOPE_MS || durationMs > 600_000) return;
    this.spans.push({ name, startedMs, endedMs, durationMs });
    if (this.spans.length > MAX_SPANS) this.spans.shift();
  }

  tick(
    nowMs: number, observedAtMs: number, elapsedMs: number, cpuTimeMs: number | null,
    context: Partial<{
      gcPauseMs: number | null;
      gcCount: number | null;
      majorGcCount: number | null;
      eventLoopActiveMs: number | null;
      eventLoopIdleMs: number | null;
    }> = {},
  ): RuntimeStallEvent | null {
    if (!Number.isFinite(nowMs) || !Number.isFinite(observedAtMs) ||
        !Number.isFinite(elapsedMs) || elapsedMs <= 0) return null;
    // A monotonic clock prevents NTP or wall-clock adjustments looking like stalls.
    this.spans = this.spans.filter((span) => nowMs - span.endedMs <= SPAN_RETENTION_MS);
    const overshootMs = Math.max(0, elapsedMs - STALL_HEARTBEAT_MS);
    if (overshootMs < STALL_THRESHOLD_MS) return null;

    // Match the *late* portion of the heartbeat interval, not arbitrary nearby
    // operations. Require at least half the measured overshoot to be covered by
    // a completed, named synchronous scope before reporting a candidate.
    const expectedMs = nowMs - overshootMs;
    let candidate: RuntimeStallEvent["correlatedScope"] = null;
    for (const span of this.spans) {
      const overlapMs = Math.max(0, Math.min(span.endedMs, nowMs) - Math.max(span.startedMs, expectedMs));
      if (overlapMs >= Math.max(SLOW_SCOPE_MS, overshootMs / 2) &&
          (!candidate || overlapMs > candidate.overlapMs)) {
        candidate = {
          name: span.name,
          durationMs: Number(span.durationMs.toFixed(3)),
          overlapMs: Number(overlapMs.toFixed(3)),
        };
      }
    }
    const percent = cpuTimeMs !== null && Number.isFinite(cpuTimeMs) && cpuTimeMs >= 0
      ? Number(Math.min(1_000, 100 * cpuTimeMs / elapsedMs).toFixed(1))
      : null;
    const bounded = (value: number | null | undefined): number | null =>
      value !== null && value !== undefined && Number.isFinite(value) && value >= 0
        ? Number(Math.min(value, 600_000).toFixed(3)) : null;
    const event: RuntimeStallEvent = {
      observedAt: new Date(observedAtMs).toISOString(),
      overshootMs: Number(overshootMs.toFixed(3)),
      intervalMs: Number(elapsedMs.toFixed(3)),
      intervalCpuPercent: percent,
      intervalGcPauseMs: bounded(context.gcPauseMs),
      intervalGcCount: bounded(context.gcCount),
      intervalMajorGcCount: bounded(context.majorGcCount),
      intervalEventLoopActiveMs: bounded(context.eventLoopActiveMs),
      intervalEventLoopIdleMs: bounded(context.eventLoopIdleMs),
      correlatedScope: candidate,
      attribution: candidate ? "temporal-overlap-only" : "unattributed",
    };
    this.events.push(event);
    this.total += 1;
    if (this.events.length > MAX_EVENTS) this.events.shift();
    return event;
  }

  snapshot(): { totalStalls: number; recentStalls: RuntimeStallEvent[] } {
    return {
      totalStalls: this.total,
      recentStalls: this.events.map((event) => ({
        ...event,
        correlatedScope: event.correlatedScope ? { ...event.correlatedScope } : null,
      })),
    };
  }
}

type ProcessStallEvidenceState = {
  enabled: boolean;
  timer: ReturnType<typeof setInterval> | null;
  recorder: RuntimeStallEvidenceRecorder;
};

const processGlobal = globalThis as typeof globalThis & {
  __airRadarRuntimeStallEvidence?: ProcessStallEvidenceState;
};
const state = processGlobal.__airRadarRuntimeStallEvidence ??= {
  enabled: false,
  timer: null,
  recorder: new RuntimeStallEvidenceRecorder(),
};

export function startRuntimeStallEvidence(): void {
  if (state.timer || process.env.AIRRADAR_STALL_EVIDENCE_ENABLED !== "1") return;
  let lastTickMs = performance.now();
  let lastCpu = process.cpuUsage();
  let lastGc = getRuntimeGcTotals();
  let lastElu = performance.eventLoopUtilization();
  state.enabled = true;
  state.timer = setInterval(() => {
    const nowMs = performance.now();
    const elapsedMs = nowMs - lastTickMs;
    const cpu = process.cpuUsage(lastCpu);
    const currentGc = getRuntimeGcTotals();
    const currentElu = performance.eventLoopUtilization();
    const deltaElu = performance.eventLoopUtilization(currentElu, lastElu);
    const deltaGc = (field: "gcPauseMs" | "gcCount" | "majorGcCount"): number | null => {
      if (!lastGc || !currentGc) return null;
      const delta = currentGc[field] - lastGc[field];
      return Number.isFinite(delta) && delta >= 0 ? delta : null;
    };
    const intervalContext = {
      gcPauseMs: deltaGc("gcPauseMs"),
      gcCount: deltaGc("gcCount"),
      majorGcCount: deltaGc("majorGcCount"),
      eventLoopActiveMs: deltaElu.active,
      eventLoopIdleMs: deltaElu.idle,
    };
    lastTickMs = nowMs;
    lastCpu = process.cpuUsage();
    lastGc = currentGc;
    lastElu = currentElu;
    state.recorder.tick(nowMs, Date.now(), elapsedMs, (cpu.user + cpu.system) / 1_000, intervalContext);
  }, STALL_HEARTBEAT_MS);
  state.timer.unref?.();
}

export function recordRuntimeSlowSyncSpan(name: string, startedMs: number, endedMs: number): void {
  if (state.enabled) state.recorder.recordSync(name, startedMs, endedMs);
}

export function getRuntimeStallEvidence(): {
  status: "enabled" | "disabled";
  heartbeatMs: number;
  thresholdMs: number;
  totalStalls: number;
  recentStalls: RuntimeStallEvent[];
} {
  return {
    status: state.enabled ? "enabled" : "disabled",
    heartbeatMs: STALL_HEARTBEAT_MS,
    thresholdMs: STALL_THRESHOLD_MS,
    ...state.recorder.snapshot(),
  };
}

/** Test/shutdown hook; does not affect the shared health observer. */
export function stopRuntimeStallEvidence(): void {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.enabled = false;
  state.recorder = new RuntimeStallEvidenceRecorder();
}
