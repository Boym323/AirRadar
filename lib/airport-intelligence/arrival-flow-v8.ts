import type { AirportArrivalSequenceSummary } from "@/lib/airport-intelligence/arrival-sequence-v7";
import type { AirportFlowPressureSummary, AirportRunwayFlowIntelligence } from "@/lib/airport-intelligence/v3";

export type AirportArrivalDemandTrend = "INCREASING" | "STABLE" | "DECREASING" | "NO_DATA";
export type AirportArrivalPressureLevel = "LOW" | "NORMAL" | "ELEVATED" | "HIGH";
export type AirportArrivalCompressionState = "NORMAL" | "ELEVATED" | "HIGH" | "UNKNOWN";
export type AirportArrivalFlowEvidence = "PUBLIC_STRONG" | "PUBLIC_PARTIAL" | "RECEIVER_ONLY";
export type AirportPredictedObservedRunwayAlignment = "ALIGNED" | "DIFFERENT" | "UNKNOWN";

export interface AirportArrivalDemandWindows {
  within5Minutes: number;
  within15Minutes: number;
  within30Minutes: number;
  between15And30Minutes: number;
  etaSamples: number;
}

export interface AirportArrivalRunwayLoad {
  runway: string;
  within5Minutes: number;
  within15Minutes: number;
  within30Minutes: number;
  share30Minutes: number | null;
}

export interface AirportArrivalFlowIntelligence {
  version: "airport-live-board-v8";
  referenceTime: string | null;
  evidence: AirportArrivalFlowEvidence;
  demand: AirportArrivalDemandWindows & {
    trend: AirportArrivalDemandTrend;
  };
  pressure: {
    level: AirportArrivalPressureLevel;
    score: number;
    activeArrivals: number;
    holding: number;
    goAround: number;
  };
  compression: {
    state: AirportArrivalCompressionState;
    minimumSpacingMinutes: number | null;
    medianSpacingMinutes: number | null;
    compressedPairs: number;
    samples: number;
  };
  predictedRunwayLoad: AirportArrivalRunwayLoad[];
  runwayAlignment: {
    state: AirportPredictedObservedRunwayAlignment;
    predictedRunway: string | null;
    predictedShare: number | null;
    predictedSamples: number;
    observedRunway: string | null;
    observedShare: number | null;
    observedSamples: number;
  };
}

const FIVE_MINUTES_MS = 5 * 60_000;
const FIFTEEN_MINUTES_MS = 15 * 60_000;
const THIRTY_MINUTES_MS = 30 * 60_000;
const COMPRESSION_SPACING_MINUTES = 4;

function finiteTime(value: string | null | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function demandTrend(near: number, later: number, etaSamples: number): AirportArrivalDemandTrend {
  if (etaSamples < 2) return "NO_DATA";
  const delta = later - near;
  if (delta >= 2) return "INCREASING";
  if (delta <= -2) return "DECREASING";
  return "STABLE";
}

function pressureLevel(score: number): AirportArrivalPressureLevel {
  if (score <= 3) return "LOW";
  if (score <= 6) return "NORMAL";
  if (score <= 9) return "ELEVATED";
  return "HIGH";
}

function evidenceLevel(
  sequence: AirportArrivalSequenceSummary,
  etaWithin30Minutes: number,
  runwayWithin30Minutes: number,
): AirportArrivalFlowEvidence {
  const horizonCoverage = sequence.totalCandidates > 0
    ? etaWithin30Minutes / sequence.totalCandidates
    : 0;
  if (etaWithin30Minutes >= 2 && horizonCoverage >= 0.75) return "PUBLIC_STRONG";
  if (etaWithin30Minutes > 0 || runwayWithin30Minutes > 0) return "PUBLIC_PARTIAL";
  return "RECEIVER_ONLY";
}

function compressionState(spacings: number[]): AirportArrivalFlowIntelligence["compression"] {
  if (!spacings.length) {
    return {
      state: "UNKNOWN",
      minimumSpacingMinutes: null,
      medianSpacingMinutes: null,
      compressedPairs: 0,
      samples: 0,
    };
  }

  const minimumSpacingMinutes = Math.min(...spacings);
  const medianSpacingMinutes = median(spacings);
  const compressedPairs = spacings.filter((spacing) => spacing < COMPRESSION_SPACING_MINUTES).length;
  const state: AirportArrivalCompressionState = minimumSpacingMinutes <= 2 || compressedPairs >= 2
    ? "HIGH"
    : minimumSpacingMinutes < COMPRESSION_SPACING_MINUTES
      ? "ELEVATED"
      : "NORMAL";

  return {
    state,
    minimumSpacingMinutes,
    medianSpacingMinutes,
    compressedPairs,
    samples: spacings.length,
  };
}

export function buildAirportArrivalFlowIntelligence(input: {
  sequence: AirportArrivalSequenceSummary;
  flowPressure: AirportFlowPressureSummary;
  runwayFlow: AirportRunwayFlowIntelligence;
  referenceTime?: string | null;
}): AirportArrivalFlowIntelligence {
  const referenceTime = input.referenceTime ?? input.sequence.generatedAt;
  const referenceMs = finiteTime(referenceTime);

  const etaRows = input.sequence.items
    .flatMap((item) => {
      const etaMs = finiteTime(item.etaAt);
      if (etaMs === null || referenceMs === null) return [];
      const horizonMs = etaMs - referenceMs;
      if (horizonMs < 0 || horizonMs > THIRTY_MINUTES_MS) return [];
      return [{ item, etaMs, horizonMs }];
    })
    .sort((left, right) => left.etaMs - right.etaMs || left.item.icaoHex.localeCompare(right.item.icaoHex));

  const demand: AirportArrivalDemandWindows = {
    within5Minutes: etaRows.filter((row) => row.horizonMs <= FIVE_MINUTES_MS).length,
    within15Minutes: etaRows.filter((row) => row.horizonMs <= FIFTEEN_MINUTES_MS).length,
    within30Minutes: etaRows.length,
    between15And30Minutes: etaRows.filter((row) => row.horizonMs > FIFTEEN_MINUTES_MS).length,
    etaSamples: etaRows.length,
  };

  const spacings = etaRows.slice(1)
    .map((row, index) => (row.etaMs - etaRows[index]!.etaMs) / 60_000)
    .filter((spacing) => Number.isFinite(spacing) && spacing >= 0);
  const compression = compressionState(spacings);

  const runwayCounts = new Map<string, { within5Minutes: number; within15Minutes: number; within30Minutes: number }>();
  for (const row of etaRows) {
    const runway = row.item.runway?.trim().toUpperCase();
    if (!runway) continue;
    const counts = runwayCounts.get(runway) ?? { within5Minutes: 0, within15Minutes: 0, within30Minutes: 0 };
    counts.within30Minutes += 1;
    if (row.horizonMs <= FIFTEEN_MINUTES_MS) counts.within15Minutes += 1;
    if (row.horizonMs <= FIVE_MINUTES_MS) counts.within5Minutes += 1;
    runwayCounts.set(runway, counts);
  }

  const runwaySamples = [...runwayCounts.values()].reduce((sum, counts) => sum + counts.within30Minutes, 0);
  const predictedRunwayLoad: AirportArrivalRunwayLoad[] = [...runwayCounts.entries()]
    .map(([runway, counts]) => ({
      runway,
      ...counts,
      share30Minutes: runwaySamples ? counts.within30Minutes / runwaySamples : null,
    }))
    .sort((left, right) =>
      right.within30Minutes - left.within30Minutes
      || right.within15Minutes - left.within15Minutes
      || left.runway.localeCompare(right.runway, undefined, { numeric: true }));

  const predictedTop = predictedRunwayLoad[0] ?? null;
  const observedRunway = input.runwayFlow.current.runway;
  const observedShare = input.runwayFlow.current.share;
  const predictedComparable = Boolean(
    predictedTop
    && predictedTop.within30Minutes >= 2
    && predictedTop.share30Minutes !== null
    && predictedTop.share30Minutes >= 0.60,
  );
  const observedComparable = Boolean(
    observedRunway
    && input.runwayFlow.current.samples >= 3
    && observedShare !== null
    && observedShare >= 0.60,
  );
  const runwayAlignment: AirportPredictedObservedRunwayAlignment = !predictedComparable || !observedComparable
    ? "UNKNOWN"
    : predictedTop!.runway === observedRunway
      ? "ALIGNED"
      : "DIFFERENT";

  const compressionScore = compression.state === "HIGH" ? 3 : compression.state === "ELEVATED" ? 1 : 0;
  const pressureScore = input.sequence.totalCandidates
    + demand.within15Minutes
    + 2 * input.flowPressure.holdingRecent
    + 2 * input.flowPressure.goAroundRecent
    + compressionScore;

  return {
    version: "airport-live-board-v8",
    referenceTime: referenceMs === null ? null : new Date(referenceMs).toISOString(),
    evidence: evidenceLevel(input.sequence, demand.etaSamples, runwaySamples),
    demand: {
      ...demand,
      trend: demandTrend(demand.within15Minutes, demand.between15And30Minutes, demand.etaSamples),
    },
    pressure: {
      level: pressureLevel(pressureScore),
      score: pressureScore,
      activeArrivals: input.sequence.totalCandidates,
      holding: input.flowPressure.holdingRecent,
      goAround: input.flowPressure.goAroundRecent,
    },
    compression,
    predictedRunwayLoad,
    runwayAlignment: {
      state: runwayAlignment,
      predictedRunway: predictedTop?.runway ?? null,
      predictedShare: predictedTop?.share30Minutes ?? null,
      predictedSamples: predictedTop?.within30Minutes ?? 0,
      observedRunway,
      observedShare,
      observedSamples: input.runwayFlow.current.samples,
    },
  };
}
