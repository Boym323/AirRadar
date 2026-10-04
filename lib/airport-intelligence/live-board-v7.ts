import type { AirportCorrelatedTrafficSnapshot, AirportActiveJourneyStage } from "@/lib/airport-intelligence/v3";
import type { PredictiveOperationsResponse } from "@/lib/predictive-intelligence/operations-center";

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
  items: AirportArrivalSequenceItem[];
  publicPredictionCount: number;
  medianSpacingMinutes: number | null;
  predictedRunway: {
    designator: string | null;
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

export function buildAirportArrivalSequence(input: {
  airportIcao: string;
  traffic: AirportCorrelatedTrafficSnapshot;
  predictive: PredictiveOperationsResponse | null;
}): AirportArrivalSequence {
  const airportIcao = canonicalAirport(input.airportIcao);
  const predictiveByHex = new Map(
    (input.predictive?.items ?? []).map((item) => [item.icaoHex.trim().toUpperCase(), item]),
  );

  const candidates = input.traffic.inbound
    .filter((observation) =>
      observation.journey.stage !== "LANDED"
      && observation.journey.stage !== "GO_AROUND"
      && observation.journey.routeRelation !== "CONFLICT")
    .map((observation) => {
      const aircraft = observation.aircraft;
      const predictive = predictiveByHex.get(aircraft.icaoHex.trim().toUpperCase()) ?? null;
      const predictionMatchesAirport = airportIcao !== null
        && canonicalAirport(predictive?.destination) === airportIcao;
      const eta = predictionMatchesAirport ? predictive?.etaAdvisory ?? null : null;
      const runway = predictionMatchesAirport ? predictive?.runwayAdvisory ?? null : null;
      const etaMs = eta ? Date.parse(eta.estimatedArrivalAt) : Number.NaN;
      return {
        aircraft,
        observation,
        eta,
        runway,
        etaMs: Number.isFinite(etaMs) ? etaMs : null,
      };
    })
    .sort((left, right) => {
      if (left.etaMs !== null && right.etaMs !== null) return left.etaMs - right.etaMs || left.observation.distanceKm - right.observation.distanceKm;
      if (left.etaMs !== null) return -1;
      if (right.etaMs !== null) return 1;
      return stagePriority(left.observation.journey.stage) - stagePriority(right.observation.journey.stage)
        || left.observation.distanceKm - right.observation.distanceKm
        || left.aircraft.icaoHex.localeCompare(right.aircraft.icaoHex);
    });

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
  const spacings = etaTimes.slice(1).map((value, index) => (value - etaTimes[index]!) / 60_000).filter((value) => Number.isFinite(value) && value >= 0);
  const runwayCounts = new Map<string, number>();
  for (const item of items) {
    if (item.predictedRunway) runwayCounts.set(item.predictedRunway, (runwayCounts.get(item.predictedRunway) ?? 0) + 1);
  }
  const runwayTop = [...runwayCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))[0] ?? null;
  const runwaySamples = [...runwayCounts.values()].reduce((sum, count) => sum + count, 0);

  return {
    items,
    publicPredictionCount: items.filter((item) => item.eta !== null || item.predictedRunway !== null).length,
    medianSpacingMinutes: median(spacings),
    predictedRunway: {
      designator: runwayTop?.[0] ?? null,
      share: runwayTop && runwaySamples > 0 ? runwayTop[1] / runwaySamples : null,
      samples: runwaySamples,
    },
  };
}
