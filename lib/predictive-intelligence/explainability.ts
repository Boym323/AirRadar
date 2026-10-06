import type { PredictionEvidence } from "./types";

export type ExplainablePredictionCapability = "ETA" | "RUNWAY" | "RUNWAY_CHANGE" | "TRAJECTORY";

export type ExplainablePredictionEvidenceKey =
  | "distanceRemainingNm"
  | "effectiveSpeedKt"
  | "phase"
  | "progressWindowSec"
  | "recentRunwayUsage"
  | "surfaceWind"
  | "candidateMargin"
  | "crossTrackKm"
  | "distanceChangeKm";

export interface ExplainablePredictionEvidence {
  key: ExplainablePredictionEvidenceKey;
  value: string | number;
}

const KEYS: Record<ExplainablePredictionCapability, ReadonlySet<ExplainablePredictionEvidenceKey>> = {
  ETA: new Set(["distanceRemainingNm", "effectiveSpeedKt", "phase", "progressWindowSec"]),
  RUNWAY: new Set(["recentRunwayUsage", "surfaceWind", "candidateMargin"]),
  RUNWAY_CHANGE: new Set(["recentRunwayUsage", "surfaceWind", "candidateMargin"]),
  TRAJECTORY: new Set(["crossTrackKm", "distanceChangeKm"]),
};

function safeValue(value: string | number): string | number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.trim().replace(/[\r\n\t]+/g, " ");
  return cleaned ? cleaned.slice(0, 80) : null;
}

/**
 * Converts internal prediction evidence into a small, explicitly whitelisted
 * product contract. Unknown/internal diagnostic keys fail closed.
 */
export function explainablePredictionEvidence(
  capability: ExplainablePredictionCapability,
  evidence: readonly PredictionEvidence[],
): ExplainablePredictionEvidence[] {
  const allowed = KEYS[capability];
  const result: ExplainablePredictionEvidence[] = [];
  for (const item of evidence) {
    if (!allowed.has(item.key as ExplainablePredictionEvidenceKey)) continue;
    const value = safeValue(item.value);
    if (value === null) continue;
    result.push({ key: item.key as ExplainablePredictionEvidenceKey, value });
    if (result.length >= 6) break;
  }
  return result;
}
