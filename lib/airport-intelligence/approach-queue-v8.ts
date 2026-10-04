import type { AirportArrivalSequenceSummary } from "@/lib/airport-intelligence/arrival-sequence-v7";

export const AIRPORT_LIVE_BOARD_V8_COMPRESSED_GAP_MINUTES = 4;
export const AIRPORT_LIVE_BOARD_V8_BUILDING_MEDIAN_MINUTES = 6;
export const AIRPORT_LIVE_BOARD_V8_MIN_ETA_SAMPLES = 3;
export const AIRPORT_LIVE_BOARD_V8_DENSE_ARRIVALS = 4;
export const AIRPORT_LIVE_BOARD_V8_DENSE_APPROACH = 3;

export type AirportApproachQueueState =
  | "EMPTY"
  | "LOW_DENSITY"
  | "ACTIVE"
  | "BUILDING"
  | "COMPRESSED"
  | "HOLDING_PRESENT";

export type AirportApproachQueueReason =
  | "no_arrivals"
  | "sparse_traffic"
  | "active_traffic"
  | "arrival_density"
  | "approach_density"
  | "eta_compression"
  | "holding_present"
  | "multiple_holding";

export interface AirportApproachQueueIntelligence {
  version: "airport-live-board-v8";
  state: AirportApproachQueueState;
  activeArrivals: number;
  approachOrFinal: number;
  holding: number;
  etaSamples: number;
  etaCoverage: number | null;
  medianSpacingMinutes: number | null;
  minimumSpacingMinutes: number | null;
  compressedPairs: number;
  reasons: AirportApproachQueueReason[];
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function buildAirportApproachQueueIntelligence(
  sequence: AirportArrivalSequenceSummary,
): AirportApproachQueueIntelligence {
  const activeArrivals = sequence.items.length;
  const approachOrFinal = sequence.items.filter(
    (item) => item.stage === "APPROACH" || item.stage === "FINAL",
  ).length;
  const holding = sequence.items.filter((item) => item.stage === "HOLDING").length;

  const etaTimes = sequence.items
    .map((item) => item.etaAt ? Date.parse(item.etaAt) : Number.NaN)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  const spacings: number[] = [];
  for (let index = 1; index < etaTimes.length; index += 1) {
    const spacingMinutes = (etaTimes[index]! - etaTimes[index - 1]!) / 60_000;
    if (spacingMinutes >= 0) spacings.push(spacingMinutes);
  }

  const etaSamples = etaTimes.length;
  const etaCoverage = activeArrivals > 0 ? etaSamples / activeArrivals : null;
  const medianSpacingMinutes = median(spacings);
  const minimumSpacingMinutes = spacings.length ? Math.min(...spacings) : null;
  const compressedPairs = spacings.filter(
    (spacing) => spacing <= AIRPORT_LIVE_BOARD_V8_COMPRESSED_GAP_MINUTES,
  ).length;

  let state: AirportApproachQueueState;
  const reasons: AirportApproachQueueReason[] = [];

  if (activeArrivals === 0) {
    state = "EMPTY";
    reasons.push("no_arrivals");
  } else if (holding >= 2) {
    state = "HOLDING_PRESENT";
    reasons.push("multiple_holding");
  } else if (
    etaSamples >= AIRPORT_LIVE_BOARD_V8_MIN_ETA_SAMPLES
    && compressedPairs >= 2
  ) {
    state = "COMPRESSED";
    reasons.push("eta_compression");
    if (holding > 0) reasons.push("holding_present");
  } else if (
    activeArrivals >= AIRPORT_LIVE_BOARD_V8_DENSE_ARRIVALS
    && (
      (etaSamples >= AIRPORT_LIVE_BOARD_V8_MIN_ETA_SAMPLES
        && medianSpacingMinutes !== null
        && medianSpacingMinutes <= AIRPORT_LIVE_BOARD_V8_BUILDING_MEDIAN_MINUTES)
      || holding > 0
      || approachOrFinal >= AIRPORT_LIVE_BOARD_V8_DENSE_APPROACH
    )
  ) {
    state = "BUILDING";
    reasons.push("arrival_density");
    if (approachOrFinal >= AIRPORT_LIVE_BOARD_V8_DENSE_APPROACH) reasons.push("approach_density");
    if (
      etaSamples >= AIRPORT_LIVE_BOARD_V8_MIN_ETA_SAMPLES
      && medianSpacingMinutes !== null
      && medianSpacingMinutes <= AIRPORT_LIVE_BOARD_V8_BUILDING_MEDIAN_MINUTES
    ) reasons.push("eta_compression");
    if (holding > 0) reasons.push("holding_present");
  } else if (activeArrivals <= 2) {
    state = "LOW_DENSITY";
    reasons.push("sparse_traffic");
  } else {
    state = "ACTIVE";
    reasons.push("active_traffic");
    if (holding > 0) reasons.push("holding_present");
  }

  return {
    version: "airport-live-board-v8",
    state,
    activeArrivals,
    approachOrFinal,
    holding,
    etaSamples,
    etaCoverage,
    medianSpacingMinutes,
    minimumSpacingMinutes,
    compressedPairs,
    reasons,
  };
}
