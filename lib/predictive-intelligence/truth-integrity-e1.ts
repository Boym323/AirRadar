import type { PredictiveTrendSample } from "./accuracy-trends";

export const PREDICTIVE_TRUTH_INTEGRITY_VERSION = "predictive-truth-integrity-e1" as const;
export type TruthIntegrityState = "SOURCE_UNAVAILABLE" | "COLLECTION_INCOMPLETE" | "NO_EVIDENCE" | "PARTIAL" | "SCOREABLE";
export type TruthIntegrityReason = "INVALID_LIFECYCLE" | "INVALID_TIMESTAMP" | "DUPLICATE_CAPTURE" | "UNCONFIRMED_TRUTH" | "INVALID_SCORE";

export interface TruthIntegrityReport {
  version: typeof PREDICTIVE_TRUTH_INTEGRITY_VERSION;
  state: TruthIntegrityState;
  inspected: number;
  distinctFlights: number;
  scoreable: number;
  unscorable: number;
  reasons: Record<TruthIntegrityReason, number>;
  scoreableShare: number | null;
  /** Observed scoring coverage is not an accuracy or graduation decision. */
  eligibleForGraduation: false;
}

/** Read-only accounting of the same independent-scored ETA/RUNWAY cohort used by A2. */
export function buildPredictiveTruthIntegrity(
  samples: readonly PredictiveTrendSample[],
  options: { now: Date; sourceAvailable: boolean; complete: boolean; maxAgeDays?: number },
): TruthIntegrityReport {
  const now = options.now.getTime();
  const start = now - Math.min(90, Math.max(1, options.maxAgeDays ?? 30)) * 86_400_000;
  const reasons: Record<TruthIntegrityReason, number> = {
    INVALID_LIFECYCLE: 0, INVALID_TIMESTAMP: 0, DUPLICATE_CAPTURE: 0,
    UNCONFIRMED_TRUTH: 0, INVALID_SCORE: 0,
  };
  const unique = new Map<string, PredictiveTrendSample>();
  for (const row of samples) {
    if (!row.lifecycleKey.trim()) { reasons.INVALID_LIFECYCLE++; continue; }
    const at = row.predictedAtMs;
    if (at === null || !Number.isSafeInteger(at) || at < start || at > now) {
      reasons.INVALID_TIMESTAMP++; continue;
    }
    const key = row.capability + ":" + row.lifecycleKey;
    const previous = unique.get(key);
    if (previous) {
      reasons.DUPLICATE_CAPTURE++;
      if (previous.predictedAtMs! < at || (previous.predictedAtMs === at
        && previous.observationKey <= row.observationKey)) continue;
    }
    unique.set(key, row);
  }
  let scoreable = 0;
  for (const row of unique.values()) {
    if (!row.scored) { reasons.UNCONFIRMED_TRUTH++; continue; }
    const valid = row.capability === "ETA"
      ? typeof row.etaAbsoluteErrorSeconds === "number"
        && Number.isFinite(row.etaAbsoluteErrorSeconds) && row.etaAbsoluteErrorSeconds >= 0
      : typeof row.runwayExactEnd === "boolean";
    if (valid) scoreable++;
    else reasons.INVALID_SCORE++;
  }
  const distinctFlights = unique.size;
  const state: TruthIntegrityState = !options.sourceAvailable ? "SOURCE_UNAVAILABLE"
    : !options.complete ? "COLLECTION_INCOMPLETE"
    : !distinctFlights ? "NO_EVIDENCE"
    : scoreable === distinctFlights ? "SCOREABLE" : "PARTIAL";
  return {
    version: PREDICTIVE_TRUTH_INTEGRITY_VERSION, state, inspected: samples.length,
    distinctFlights, scoreable, unscorable: distinctFlights - scoreable,
    reasons, scoreableShare: distinctFlights ? scoreable / distinctFlights : null,
    eligibleForGraduation: false,
  };
}
