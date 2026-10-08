import type { PredictiveCapability } from "./graduation";

export const PREDICTIVE_CAPTURE_HEALTH_VERSION = "predictive-capture-health-v1" as const;
export const PREDICTIVE_CAPTURE_RECENT_HOURS = 24 as const;
const RECENT_WINDOW_MS = PREDICTIVE_CAPTURE_RECENT_HOURS * 60 * 60_000;
const CAPABILITIES = ["ETA", "RUNWAY", "RUNWAY_CHANGE", "TRAJECTORY"] as const;

type CaptureRow = {
  capability: string;
  createdAt: unknown;
};

export type PredictiveCaptureHealthState =
  | "SOURCE_UNAVAILABLE"
  | "CAPTURE_DISABLED"
  | "COLLECTION_INCOMPLETE"
  | "NO_TIMESTAMPED_SAMPLES"
  | "NO_RECENT_SAMPLES"
  | "RECENT_SAMPLES";

interface CapabilityCaptureHealth {
  recent24h: number;
  lastPersistedAt: string | null;
}

export interface PredictiveCaptureHealth {
  version: typeof PREDICTIVE_CAPTURE_HEALTH_VERSION;
  state: PredictiveCaptureHealthState;
  captureConfigured: boolean;
  observationRows: number;
  timestampedRows: number;
  recent24h: number;
  lastPersistedAt: string | null;
  perCapability: Record<PredictiveCapability, CapabilityCaptureHealth>;
}

function timestamp(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "epochMilliseconds" in value) {
    const ms = value.epochMilliseconds;
    return typeof ms === "number" && Number.isSafeInteger(ms) ? ms : null;
  }
  return null;
}

// Diagnostic only: recent persisted samples are evidence of capture activity,
// never evidence of prediction quality, ground truth, or graduation eligibility.
export function buildPredictiveCaptureHealth(
  rows: readonly CaptureRow[],
  options: { now: Date; sourceAvailable: boolean; complete: boolean; captureConfigured: boolean },
): PredictiveCaptureHealth {
  const now = options.now.getTime();
  const cutoff = now - RECENT_WINDOW_MS;
  const counts: Record<PredictiveCapability, { recent24h: number; lastMs: number | null }> = {
    ETA: { recent24h: 0, lastMs: null },
    RUNWAY: { recent24h: 0, lastMs: null },
    RUNWAY_CHANGE: { recent24h: 0, lastMs: null },
    TRAJECTORY: { recent24h: 0, lastMs: null },
  };
  let timestampedRows = 0;
  let recent24h = 0;
  let latest: number | null = null;

  for (const row of rows) {
    const at = timestamp(row.createdAt);
    // Clock-skewed future dates and invalid timestamps cannot establish health.
    if (at === null || at > now || at < now - 30 * 86_400_000) continue;
    timestampedRows += 1;
    if (at >= cutoff) recent24h += 1;
    latest = Math.max(latest ?? at, at);
    if (CAPABILITIES.some((capability) => capability === row.capability)) {
      const slot = counts[row.capability as PredictiveCapability];
      if (at >= cutoff) slot.recent24h += 1;
      slot.lastMs = Math.max(slot.lastMs ?? at, at);
    }
  }

  const perCapability = Object.fromEntries(CAPABILITIES.map((capability) => [
    capability, {
      recent24h: counts[capability].recent24h,
      lastPersistedAt: counts[capability].lastMs === null ? null : new Date(counts[capability].lastMs).toISOString(),
    },
  ])) as Record<PredictiveCapability, CapabilityCaptureHealth>;

  const state: PredictiveCaptureHealthState =
    !options.sourceAvailable ? "SOURCE_UNAVAILABLE"
      : !options.captureConfigured ? "CAPTURE_DISABLED"
        : !options.complete ? "COLLECTION_INCOMPLETE"
          : timestampedRows === 0 ? "NO_TIMESTAMPED_SAMPLES"
            : recent24h === 0 ? "NO_RECENT_SAMPLES" : "RECENT_SAMPLES";

  return {
    version: PREDICTIVE_CAPTURE_HEALTH_VERSION,
    state,
    captureConfigured: options.captureConfigured,
    observationRows: rows.length,
    timestampedRows,
    recent24h,
    lastPersistedAt: latest === null ? null : new Date(latest).toISOString(),
    perCapability,
  };
}
