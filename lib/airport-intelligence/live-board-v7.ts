import type { AirportCorrelatedTrafficSnapshot, AirportActiveJourneyStage } from "@/lib/airport-intelligence/v3";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence/operations-center";

export const AIRPORT_LIVE_BOARD_V7_SEQUENCE_LIMIT = 6;

export type AirportArrivalPredictedRunwayConsistency = "STABLE" | "MIXED" | "UNKNOWN";

export interface AirportArrivalSequenceItem {
  position: number;
  icaoHex: string;
  label: string;
  stage: AirportActiveJourneyStage;
  distanceKm: number;
  eta: string | null;
  etaHorizonMinutes: number | null;
  etaUncertaintyMinutes: number | null;
  predictedRunway: string | null;
  predictionConfidence: string | null;
}

export interface AirportArrivalSequence {
  version: "airport-live-board-v7";
  items: AirportArrivalSequenceItem[];
  publicPredictionCount: number;
  predictionCoverage: number | null;
  medianSpacingMinutes: number | null;
  predictedRunway: {
    designator: string | null;
    consistency: AirportArrivalPredictedRunwayConsistency;
    share: number | null;
    samples: number;
  };
}

function canonicalAirport(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

function stagePriority(stage: AirportActiveJourneyStage): number {
  if (stage === "FINAL") return 0;
  if (stage === "APPROACH") return 1;
  if (stage === "HOLDING") return 2;
  if (stage === "INBOUND") return 3;
  return 4;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function predictedRunwaySummary(runways: string[]): AirportArrivalSequence["predictedRunway"] {
  const counts = new Map<string, number>();
  for (const value of runways) {
    const runway = value.trim().toUpperCase();
    if (runway) counts.set(runway, (counts.get(runway) ?? 0) + 1);
  }
  const samples = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))[0] ?? null;
  if (!top) return { designator: null, consistency: "UNKNOWN", share: null, samples: 0 };
  const share = top[1] / samples;
  return {
    designator: top[0],
    consistency: samples < 2 ? "UNKNOWN" : share >= 0.75 ? "STABLE" : "MIXED",
    share,
    samples,
  };
}

export function buildAirportArrivalSequence(input: {
  airportIcao: string;
  traffic: AirportCorrelatedTrafficSnapshot;
  predictive: PredictiveOperationsResponse | null;
  limit?: number;
}): AirportArrivalSequence {
  const airportIcao = canonicalAirport(input.airportIcao);
  const predictiveByHex = new Map(
    (input.predictive?.items ?? []).map((item) => [item.icaoHex.trim().toUpperCase(), item]),
  );

  const candidates = input.traffic.inbound
    .filter((observation) =>
      !observation.aircraft.onGround
      && observation.journey.stage !== "LANDED"
      && observation.journey.stage !== "GO_AROUND"
      && observation.journey.routeRelation !== "CONFLICT")
    .flatMap((observation) => {
      const aircraft = observation.aircraft;
      const predictive = predictiveByHex.get(aircraft.icaoHex.trim().toUpperCase()) ?? null;
      const predictionMatchesAirport = airportIcao !== null
        && canonicalAirport(predictive?.destination) === airportIcao;
      const routeConfirmed = observation.journey.routeRelation === "CONFIRMED";
      if (!routeConfirmed && !predictionMatchesAirport) return [];

      const eta = predictionMatchesAirport ? predictive?.etaAdvisory ?? null : null;
      const runway = predictionMatchesAirport ? predictive?.runwayAdvisory ?? null : null;
      const etaMs = eta ? Date.parse(eta.estimatedArrivalAt) : Number.NaN;
      return [{
        aircraft,
        observation,
        eta,
        runway,
        etaMs: Number.isFinite(etaMs) ? etaMs : null,
      }];
    })
    .sort((left, right) => {
      if (left.etaMs !== null && right.etaMs !== null) {
        return left.etaMs - right.etaMs || left.observation.distanceKm - right.observation.distanceKm;
      }
      if (left.etaMs !== null) return -1;
      if (right.etaMs !== null) return 1;
      return stagePriority(left.observation.journey.stage) - stagePriority(right.observation.journey.stage)
        || left.observation.distanceKm - right.observation.distanceKm
        || left.aircraft.icaoHex.localeCompare(right.aircraft.icaoHex);
    })
    .slice(0, Math.max(1, input.limit ?? AIRPORT_LIVE_BOARD_V7_SEQUENCE_LIMIT));

  const items = candidates.map((candidate, index): AirportArrivalSequenceItem => ({
    position: index + 1,
    icaoHex: candidate.aircraft.icaoHex,
    label: candidate.aircraft.callsign || candidate.aircraft.registration || candidate.aircraft.icaoHex,
    stage: candidate.observation.journey.stage,
    distanceKm: candidate.observation.distanceKm,
    eta: candidate.eta?.estimatedArrivalAt ?? null,
    etaHorizonMinutes: candidate.eta?.horizonMinutes ?? null,
    etaUncertaintyMinutes: candidate.eta?.uncertaintyMinutes ?? null,
    predictedRunway: candidate.runway?.runway ?? null,
    predictionConfidence: candidate.runway?.confidence ?? candidate.eta?.confidence ?? null,
  }));

  const etaTimes = candidates.flatMap((candidate) => candidate.etaMs === null ? [] : [candidate.etaMs]);
  const spacings = etaTimes.slice(1)
    .map((value, index) => (value - etaTimes[index]!) / 60_000)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const publicPredictionCount = items.filter((item) => item.eta !== null || item.predictedRunway !== null).length;

  return {
    version: "airport-live-board-v7",
    items,
    publicPredictionCount,
    predictionCoverage: items.length ? publicPredictionCount / items.length : null,
    medianSpacingMinutes: median(spacings),
    predictedRunway: predictedRunwaySummary(items.flatMap((item) => item.predictedRunway ? [item.predictedRunway] : [])),
  };
}
