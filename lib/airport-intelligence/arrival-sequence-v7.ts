import type { AirportCorrelatedTrafficSnapshot, AirportActiveJourneyStage } from "@/lib/airport-intelligence/v3";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence/operations-center";
import type { PredictionConfidence } from "@/lib/predictive-intelligence/types";

export const AIRPORT_LIVE_BOARD_V7_SEQUENCE_LIMIT = 6;

export type AirportArrivalSequenceRunwayConsistency = "STABLE" | "MIXED" | "UNKNOWN";
export type AirportArrivalSequenceOrderBasis = "ETA" | "DISTANCE";

export interface AirportArrivalSequenceItem {
  position: number;
  icaoHex: string;
  label: string;
  stage: AirportActiveJourneyStage;
  distanceKm: number;
  orderBasis: AirportArrivalSequenceOrderBasis;
  etaAt: string | null;
  etaHorizonMinutes: number | null;
  etaUncertaintyMinutes: number | null;
  etaConfidence: PredictionConfidence | null;
  runway: string | null;
  runwayConfidence: PredictionConfidence | null;
}

export interface AirportArrivalSequenceSummary {
  version: "airport-live-board-v7";
  generatedAt: string | null;
  totalCandidates: number;
  etaPredicted: number;
  runwayPredicted: number;
  predictionCoverage: number | null;
  medianSpacingMinutes: number | null;
  runway: {
    designator: string | null;
    consistency: AirportArrivalSequenceRunwayConsistency;
    share: number | null;
    samples: number;
  };
  items: AirportArrivalSequenceItem[];
}

function canonicalAirport(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function runwayConsensus(runways: string[]): AirportArrivalSequenceSummary["runway"] {
  const counts = new Map<string, number>();
  for (const raw of runways) {
    const runway = raw.trim().toUpperCase();
    if (!runway) continue;
    counts.set(runway, (counts.get(runway) ?? 0) + 1);
  }
  const samples = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { numeric: true }))[0] ?? null;
  if (!top) return { designator: null, consistency: "UNKNOWN", share: null, samples: 0 };
  const share = top[1] / samples;
  const consistency: AirportArrivalSequenceRunwayConsistency = samples < 2
    ? "UNKNOWN"
    : share >= 0.75
      ? "STABLE"
      : "MIXED";
  return { designator: top[0], consistency, share, samples };
}

function sequenceStage(stage: AirportActiveJourneyStage): boolean {
  return stage === "INBOUND" || stage === "HOLDING" || stage === "APPROACH" || stage === "FINAL";
}

export function buildAirportArrivalSequence(
  snapshot: AirportCorrelatedTrafficSnapshot,
  predictions: PredictiveOperationsResponse | null,
  airportIcao: string,
  limit = AIRPORT_LIVE_BOARD_V7_SEQUENCE_LIMIT,
): AirportArrivalSequenceSummary {
  const airport = canonicalAirport(airportIcao);
  const byHex = new Map((predictions?.items ?? []).map((item) => [item.icaoHex.trim().toUpperCase(), item]));
  const candidates = snapshot.inbound
    .filter((observation) => !observation.aircraft.onGround && sequenceStage(observation.journey.stage))
    .flatMap((observation) => {
      const hex = observation.aircraft.icaoHex.trim().toUpperCase();
      const prediction = byHex.get(hex) ?? null;
      const predictedDestination = canonicalAirport(prediction?.destination);
      const routeConfirmed = observation.journey.routeRelation === "CONFIRMED";
      if (observation.journey.routeRelation === "CONFLICT") return [];
      if (!routeConfirmed && (!airport || predictedDestination !== airport)) return [];

      const eta = prediction?.etaAdvisory ?? null;
      const runway = prediction?.runwayAdvisory ?? null;
      const etaMs = eta ? Date.parse(eta.estimatedArrivalAt) : Number.NaN;
      return [{
        position: 0,
        icaoHex: hex,
        label: observation.aircraft.callsign || observation.aircraft.registration || hex,
        stage: observation.journey.stage,
        distanceKm: observation.distanceKm,
        orderBasis: eta && Number.isFinite(etaMs) ? "ETA" : "DISTANCE",
        etaAt: eta && Number.isFinite(etaMs) ? eta.estimatedArrivalAt : null,
        etaHorizonMinutes: eta?.horizonMinutes ?? null,
        etaUncertaintyMinutes: eta?.uncertaintyMinutes ?? null,
        etaConfidence: eta?.confidence ?? null,
        runway: runway?.runway ?? null,
        runwayConfidence: runway?.confidence ?? null,
      } satisfies AirportArrivalSequenceItem];
    })
    .sort((left, right) => {
      const leftEta = left.etaAt ? Date.parse(left.etaAt) : Number.POSITIVE_INFINITY;
      const rightEta = right.etaAt ? Date.parse(right.etaAt) : Number.POSITIVE_INFINITY;
      if (leftEta !== rightEta) return leftEta - rightEta;
      return left.distanceKm - right.distanceKm || left.icaoHex.localeCompare(right.icaoHex);
    })
    .slice(0, Math.max(1, limit))
    .map((item, index) => ({ ...item, position: index + 1 }));

  const etaTimes = candidates
    .map((item) => item.etaAt ? Date.parse(item.etaAt) : Number.NaN)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const spacings: number[] = [];
  for (let index = 1; index < etaTimes.length; index += 1) {
    const spacing = (etaTimes[index]! - etaTimes[index - 1]!) / 60_000;
    if (spacing >= 0) spacings.push(spacing);
  }

  const etaPredicted = candidates.filter((item) => item.etaAt !== null).length;
  const runwayValues = candidates.flatMap((item) => item.runway ? [item.runway] : []);
  return {
    version: "airport-live-board-v7",
    generatedAt: predictions?.generatedAt ?? null,
    totalCandidates: candidates.length,
    etaPredicted,
    runwayPredicted: runwayValues.length,
    predictionCoverage: candidates.length ? etaPredicted / candidates.length : null,
    medianSpacingMinutes: median(spacings),
    runway: runwayConsensus(runwayValues),
    items: candidates,
  };
}
