import type { AirportRunwayFlowIntelligence } from "@/lib/airport-intelligence/v3";
import type { AirportArrivalFlowIntelligence } from "@/lib/airport-intelligence/arrival-flow-v8";

export type AirportRunwayEvidenceState =
  | "OBSERVED_TRANSITION" | "PREDICTED_DIVERGENCE" | "OBSERVED_STABLE" | "UNKNOWN";
export type AirportRunwayEvidenceReason =
  | "OBSERVED_WINDOW_CHANGE" | "PUBLIC_PREDICTION_DIFFERS"
  | "OBSERVED_WINDOWS_STABLE" | "INSUFFICIENT_INDEPENDENT_EVIDENCE";

export interface AirportRunwayChangeEvidenceD2 {
  version: "airport-runway-evidence-d2";
  state: AirportRunwayEvidenceState;
  reason: AirportRunwayEvidenceReason;
  previousRunway: string | null;
  observedRunway: string | null;
  predictedRunway: string | null;
  previousSamples: number;
  observedSamples: number;
  predictedSamples: number;
  windFavoredRunway: string | null;
  /** Wind is context, not evidence of an ATC runway assignment. */
  windAlignment: AirportRunwayFlowIntelligence["windAlignment"];
}

/** Read-only interpretation of already deduplicated, time-windowed runway evidence. */
export function buildAirportRunwayChangeEvidenceD2(
  observed: AirportRunwayFlowIntelligence,
  arrival: AirportArrivalFlowIntelligence,
): AirportRunwayChangeEvidenceD2 {
  const previousStrong = observed.previous.samples >= 3
    && (observed.previous.share ?? 0) >= 0.60;
  const currentStrong = observed.current.samples >= 3
    && (observed.current.share ?? 0) >= 0.60;
  const predictedStrong = arrival.runwayAlignment.predictedSamples >= 2
    && (arrival.runwayAlignment.predictedShare ?? 0) >= 0.60
    && arrival.runwayAlignment.predictedRunway !== null;
  const changeSupported = observed.state === "TRANSITIONING"
    && previousStrong && currentStrong
    && observed.transition?.from === observed.previous.runway
    && observed.transition?.to === observed.current.runway
    && observed.previous.runway !== observed.current.runway;
  const stableSupported = observed.state === "STABLE" && previousStrong && currentStrong
    && observed.previous.runway === observed.current.runway;

  let state: AirportRunwayEvidenceState = "UNKNOWN";
  let reason: AirportRunwayEvidenceReason = "INSUFFICIENT_INDEPENDENT_EVIDENCE";
  if (changeSupported) {
    state = "OBSERVED_TRANSITION";
    reason = "OBSERVED_WINDOW_CHANGE";
  } else if (stableSupported && predictedStrong
    && arrival.runwayAlignment.predictedRunway !== observed.current.runway) {
    state = "PREDICTED_DIVERGENCE";
    reason = "PUBLIC_PREDICTION_DIFFERS";
  } else if (stableSupported) {
    state = "OBSERVED_STABLE";
    reason = "OBSERVED_WINDOWS_STABLE";
  }

  return {
    version: "airport-runway-evidence-d2", state, reason,
    previousRunway: observed.previous.runway,
    observedRunway: observed.current.runway,
    predictedRunway: predictedStrong ? arrival.runwayAlignment.predictedRunway : null,
    previousSamples: observed.previous.samples,
    observedSamples: observed.current.samples,
    predictedSamples: predictedStrong ? arrival.runwayAlignment.predictedSamples : 0,
    windFavoredRunway: observed.windFavoredRunway,
    windAlignment: observed.windAlignment,
  };
}
