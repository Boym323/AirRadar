import type { RuntimeTelemetrySample } from "@/lib/server/runtime-telemetry";

export const RUNTIME_MONITOR_VERSION = 1 as const;
export const RUNTIME_MONITOR_WINDOW_SIZE = 5;

export const RUNTIME_MONITOR_THRESHOLDS = {
  cpuP95Percent: 85,
  eventLoopP99Ms: 1_000,
  databaseCallP95Ms: 1_000,
  circuitOpenFraction: 0.5,
  availabilityPercent: 95,
} as const;

export type RuntimeMonitorSeverity = "warning" | "degraded" | "critical";
export type RuntimeMonitorIncidentStatus = "open" | "resolved";
export type RuntimeMonitorIssue = "cpu" | "event_loop" | "database_call" | "route_circuit" | "availability";

export interface RuntimeMonitorIncident {
  id: `runtime-${RuntimeMonitorIssue}`;
  issue: RuntimeMonitorIssue;
  status: RuntimeMonitorIncidentStatus;
  severity: RuntimeMonitorSeverity;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  occurrences: number;
  lastValue: number | null;
}

export interface RuntimeMonitorState {
  version: typeof RUNTIME_MONITOR_VERSION;
  attempts: number;
  successes: number;
  unavailable: number;
  availabilityWindow: boolean[];
  incidents: RuntimeMonitorIncident[];
  lastEvaluationAt: string | null;
}

export interface RuntimeMonitorAlert {
  id: RuntimeMonitorIncident["id"];
  issue: RuntimeMonitorIssue;
  severity: RuntimeMonitorSeverity;
  sustained: boolean;
  value: number | null;
  threshold: number;
}

const ALERT_THRESHOLDS: Record<RuntimeMonitorIssue, number> = {
  cpu: RUNTIME_MONITOR_THRESHOLDS.cpuP95Percent,
  event_loop: RUNTIME_MONITOR_THRESHOLDS.eventLoopP99Ms,
  database_call: RUNTIME_MONITOR_THRESHOLDS.databaseCallP95Ms,
  route_circuit: RUNTIME_MONITOR_THRESHOLDS.circuitOpenFraction * 100,
  availability: RUNTIME_MONITOR_THRESHOLDS.availabilityPercent,
};

export function activeRuntimeMonitorAlerts(state: RuntimeMonitorState): RuntimeMonitorAlert[] {
  return state.incidents.filter((incident) => incident.status === "open").map((incident) => ({
    id: incident.id,
    issue: incident.issue,
    severity: incident.severity,
    sustained: incident.severity !== "warning",
    value: incident.lastValue,
    threshold: ALERT_THRESHOLDS[incident.issue],
  }));
}

export function createRuntimeMonitorState(): RuntimeMonitorState {
  return {
    version: RUNTIME_MONITOR_VERSION,
    attempts: 0,
    successes: 0,
    unavailable: 0,
    availabilityWindow: [],
    incidents: [],
    lastEvaluationAt: null,
  };
}

function boundedCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function boundedTimestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null;
}

function validIssue(value: unknown): value is RuntimeMonitorIssue {
  return value === "cpu" || value === "event_loop" || value === "database_call" || value === "route_circuit" || value === "availability";
}

function validSeverity(value: unknown): value is RuntimeMonitorSeverity {
  return value === "warning" || value === "degraded" || value === "critical";
}

export function restoreRuntimeMonitorState(value: unknown): RuntimeMonitorState {
  const fallback = createRuntimeMonitorState();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const candidate = value as Partial<RuntimeMonitorState>;
  if (candidate.version !== RUNTIME_MONITOR_VERSION) return fallback;
  const incidents = Array.isArray(candidate.incidents) ? candidate.incidents.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<RuntimeMonitorIncident>;
    if (!validIssue(item.issue) || !validSeverity(item.severity) || (item.status !== "open" && item.status !== "resolved")) return [];
    const firstSeenAt = boundedTimestamp(item.firstSeenAt);
    const lastSeenAt = boundedTimestamp(item.lastSeenAt);
    if (!firstSeenAt || !lastSeenAt) return [];
    return [{
      id: `runtime-${item.issue}` as RuntimeMonitorIncident["id"],
      issue: item.issue,
      status: item.status,
      severity: item.severity,
      firstSeenAt,
      lastSeenAt,
      resolvedAt: boundedTimestamp(item.resolvedAt),
      occurrences: Math.min(1_000_000, Math.max(1, boundedCount(item.occurrences))),
      lastValue: typeof item.lastValue === "number" && Number.isFinite(item.lastValue) ? Math.max(0, item.lastValue) : null,
    } satisfies RuntimeMonitorIncident];
  }).slice(-16) : [];
  return {
    version: RUNTIME_MONITOR_VERSION,
    attempts: Math.min(1_000_000_000, boundedCount(candidate.attempts)),
    successes: Math.min(1_000_000_000, boundedCount(candidate.successes)),
    unavailable: Math.min(1_000_000_000, boundedCount(candidate.unavailable)),
    availabilityWindow: Array.isArray(candidate.availabilityWindow)
      ? candidate.availabilityWindow.filter((entry): entry is boolean => typeof entry === "boolean").slice(-RUNTIME_MONITOR_WINDOW_SIZE)
      : [],
    incidents,
    lastEvaluationAt: boundedTimestamp(candidate.lastEvaluationAt),
  };
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  values.sort((left, right) => left - right);
  return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? null;
}

function currentBreaches(samples: RuntimeTelemetrySample[], state: RuntimeMonitorState): Map<RuntimeMonitorIssue, { breach: boolean; value: number | null; threshold: number }> {
  const window = samples.slice(-RUNTIME_MONITOR_WINDOW_SIZE);
  const cpu = percentile(window.flatMap((sample) => sample.processCpuPercent === null || sample.processCpuPercent === undefined ? [] : [sample.processCpuPercent]), 0.95);
  const eventLoop = percentile(window.flatMap((sample) => sample.eventLoopP99Ms === null || sample.eventLoopP99Ms === undefined ? [] : [sample.eventLoopP99Ms]), 0.95);
  const databaseCall = percentile(window.flatMap((sample) => sample.databaseCallP95Ms === null || sample.databaseCallP95Ms === undefined ? [] : [sample.databaseCallP95Ms]), 0.95);
  const circuitValues = window.flatMap((sample) => sample.routeCacheCircuitOpen === true ? [1] : sample.routeCacheCircuitOpen === false ? [0] : []);
  const circuitFraction = circuitValues.length ? circuitValues.reduce((sum, value) => sum + value, 0) / circuitValues.length : null;
  const availabilityValues = state.availabilityWindow.slice(-RUNTIME_MONITOR_WINDOW_SIZE);
  const availability = availabilityValues.length
    ? availabilityValues.filter(Boolean).length / availabilityValues.length * 100
    : null;
  return new Map([
    ["cpu", { breach: cpu !== null && cpu > RUNTIME_MONITOR_THRESHOLDS.cpuP95Percent, value: cpu, threshold: RUNTIME_MONITOR_THRESHOLDS.cpuP95Percent }],
    ["event_loop", { breach: eventLoop !== null && eventLoop > RUNTIME_MONITOR_THRESHOLDS.eventLoopP99Ms, value: eventLoop, threshold: RUNTIME_MONITOR_THRESHOLDS.eventLoopP99Ms }],
    ["database_call", { breach: databaseCall !== null && databaseCall > RUNTIME_MONITOR_THRESHOLDS.databaseCallP95Ms, value: databaseCall, threshold: RUNTIME_MONITOR_THRESHOLDS.databaseCallP95Ms }],
    ["route_circuit", { breach: circuitFraction !== null && circuitFraction > RUNTIME_MONITOR_THRESHOLDS.circuitOpenFraction, value: circuitFraction === null ? null : circuitFraction * 100, threshold: RUNTIME_MONITOR_THRESHOLDS.circuitOpenFraction * 100 }],
    ["availability", { breach: availability !== null && availability < RUNTIME_MONITOR_THRESHOLDS.availabilityPercent, value: availability, threshold: RUNTIME_MONITOR_THRESHOLDS.availabilityPercent }],
  ] satisfies [RuntimeMonitorIssue, { breach: boolean; value: number | null; threshold: number }][]);
}

export function observeRuntimeMonitor(
  previous: RuntimeMonitorState,
  samples: RuntimeTelemetrySample[],
  sample: RuntimeTelemetrySample | null,
  available: boolean,
  now: number,
): { state: RuntimeMonitorState; alerts: RuntimeMonitorAlert[] } {
  const state = restoreRuntimeMonitorState(previous);
  state.attempts = Math.min(1_000_000_000, state.attempts + 1);
  if (available) state.successes = Math.min(1_000_000_000, state.successes + 1);
  else state.unavailable = Math.min(1_000_000_000, state.unavailable + 1);
  state.availabilityWindow = [...state.availabilityWindow, available].slice(-RUNTIME_MONITOR_WINDOW_SIZE);
  const evaluated = currentBreaches(samples, state);
  const alerts: RuntimeMonitorAlert[] = [];
  for (const [issue, result] of evaluated) {
    const recentBreaches = issue === "availability"
      ? state.availabilityWindow.slice(-RUNTIME_MONITOR_WINDOW_SIZE).map((entry) => !entry)
      : samples.slice(-RUNTIME_MONITOR_WINDOW_SIZE).map((entry) => {
        if (issue === "cpu") return entry.processCpuPercent !== null && entry.processCpuPercent !== undefined && entry.processCpuPercent > RUNTIME_MONITOR_THRESHOLDS.cpuP95Percent;
        if (issue === "event_loop") return entry.eventLoopP99Ms !== null && entry.eventLoopP99Ms !== undefined && entry.eventLoopP99Ms > RUNTIME_MONITOR_THRESHOLDS.eventLoopP99Ms;
        if (issue === "database_call") return entry.databaseCallP95Ms !== null && entry.databaseCallP95Ms !== undefined && entry.databaseCallP95Ms > RUNTIME_MONITOR_THRESHOLDS.databaseCallP95Ms;
        return entry.routeCacheCircuitOpen === true;
      });
    const countInWindow = recentBreaches.filter(Boolean).length;
    const sustained = recentBreaches.length >= 3 && recentBreaches.slice(-3).every(Boolean);
    const degraded = countInWindow >= 3;
    if (result.breach || degraded) {
      const severity: RuntimeMonitorSeverity = sustained ? "critical" : degraded ? "degraded" : "warning";
      const alert: RuntimeMonitorAlert = {
        id: `runtime-${issue}`,
        issue,
        severity,
        sustained: sustained || degraded,
        value: result.value,
        threshold: result.threshold,
      };
      alerts.push(alert);
      const existing = state.incidents.find((incident) => incident.id === alert.id);
      if (existing) {
        existing.status = "open";
        existing.severity = severity;
        existing.lastSeenAt = new Date(now).toISOString();
        existing.resolvedAt = null;
        existing.occurrences = Math.min(1_000_000, existing.occurrences + 1);
        existing.lastValue = result.value;
      } else {
        state.incidents.push({
          id: alert.id,
          issue,
          status: "open",
          severity,
          firstSeenAt: new Date(now).toISOString(),
          lastSeenAt: new Date(now).toISOString(),
          resolvedAt: null,
          occurrences: 1,
          lastValue: result.value,
        });
      }
    } else {
      const existing = state.incidents.find((incident) => incident.id === `runtime-${issue}` && incident.status === "open");
      if (existing) {
        existing.status = "resolved";
        existing.resolvedAt = new Date(now).toISOString();
        existing.lastSeenAt = new Date(now).toISOString();
      }
    }
  }
  state.incidents = state.incidents.slice(-16);
  state.lastEvaluationAt = new Date(now).toISOString();
  return { state, alerts };
}
