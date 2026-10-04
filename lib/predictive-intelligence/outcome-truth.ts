import type { TrajectoryState } from "./types";

export const PREDICTIVE_OUTCOME_TRUTH_VERSION = "predictive-outcome-truth-v1" as const;
export const PREDICTIVE_OUTCOME_MATCH_AFTER_MS = 6 * 60 * 60_000;
export const PREDICTIVE_RUNWAY_APPROACH_LOOKBACK_MS = 2 * 60 * 60_000;
export const PREDICTIVE_OUTCOME_MIN_EVENT_CONFIDENCE = 0.6;

export const TRAJECTORY_POSITIVE_OUTCOME_TYPES = [
  "DIVERSION",
  "GO_AROUND",
  "HOLDING",
  "ORBIT",
  "UNUSUAL_TURN",
] as const;

export type PredictiveOutcomeEventType =
  | "APPROACH"
  | "LANDING"
  | typeof TRAJECTORY_POSITIVE_OUTCOME_TYPES[number];

export interface PredictiveOutcomeObservation {
  lifecycleKey: string;
  aircraftIcao: string;
  flightId: number | null;
  predictedAt: number;
  destinationIcao: string | null;
  predictedRunway: string | null;
  previousRunway: string | null;
  trajectoryState: TrajectoryState | null;
}

export interface PredictiveOutcomeEvent {
  lifecycleKey: string;
  aircraftIcao: string;
  flightId: number | null;
  type: PredictiveOutcomeEventType;
  occurredAt: number;
  confidence: number | null;
  airportIcao: string | null;
  runway: string | null;
  groundConfirmedAt: number | null;
  reportedRunway: string | null;
}

export interface RunwayChangeOutcomeScore {
  status: "SCORED" | "UNSCORABLE";
  correct: boolean | null;
  falsePositive: boolean | null;
  lifecycleKey: string | null;
  approachRunway: string | null;
  finalRunway: string | null;
}

export interface TrajectoryOutcomeScore {
  status: "SCORED" | "UNSCORABLE";
  correct: boolean | null;
  lifecycleKey: string | null;
  outcomeType: PredictiveOutcomeEventType | "CLEAN_LANDING" | null;
}

function sameIdentity(observation: PredictiveOutcomeObservation, event: PredictiveOutcomeEvent): boolean {
  if (observation.lifecycleKey !== event.lifecycleKey) return false;
  if (observation.aircraftIcao.toUpperCase() !== event.aircraftIcao.toUpperCase()) return false;
  if (observation.flightId !== null && event.flightId !== null && observation.flightId !== event.flightId) return false;
  return true;
}

function confident(event: PredictiveOutcomeEvent): boolean {
  return event.confidence !== null
    && Number.isFinite(event.confidence)
    && event.confidence >= PREDICTIVE_OUTCOME_MIN_EVENT_CONFIDENCE;
}

function normalizedIcao(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : null;
}

export function scoreRunwayChangeOutcome(
  observation: PredictiveOutcomeObservation,
  events: readonly PredictiveOutcomeEvent[],
): RunwayChangeOutcomeScore {
  if (!observation.previousRunway || !observation.predictedRunway) {
    return { status: "UNSCORABLE", correct: null, falsePositive: null, lifecycleKey: null, approachRunway: null, finalRunway: null };
  }

  const approach = events
    .filter((event) =>
      event.type === "APPROACH"
      && sameIdentity(observation, event)
      && confident(event)
      && event.runway !== null
      && event.occurredAt <= observation.predictedAt
      && observation.predictedAt - event.occurredAt <= PREDICTIVE_RUNWAY_APPROACH_LOOKBACK_MS)
    .sort((left, right) => right.occurredAt - left.occurredAt)[0] ?? null;

  const landing = events
    .filter((event) =>
      event.type === "LANDING"
      && sameIdentity(observation, event)
      && event.reportedRunway !== null
      && event.occurredAt >= observation.predictedAt
      && event.occurredAt - observation.predictedAt <= PREDICTIVE_OUTCOME_MATCH_AFTER_MS)
    .sort((left, right) => left.occurredAt - right.occurredAt)[0] ?? null;

  if (!approach || !landing || approach.runway !== observation.previousRunway) {
    return {
      status: "UNSCORABLE",
      correct: null,
      falsePositive: null,
      lifecycleKey: landing?.lifecycleKey ?? null,
      approachRunway: approach?.runway ?? null,
      finalRunway: landing?.reportedRunway ?? null,
    };
  }

  const actualChanged = approach.runway !== landing.reportedRunway;
  return {
    status: "SCORED",
    correct: actualChanged && observation.predictedRunway === landing.reportedRunway,
    falsePositive: !actualChanged,
    lifecycleKey: landing.lifecycleKey,
    approachRunway: approach.runway,
    finalRunway: landing.reportedRunway,
  };
}

export function scoreTrajectoryOutcome(
  observation: PredictiveOutcomeObservation,
  events: readonly PredictiveOutcomeEvent[],
): TrajectoryOutcomeScore {
  if (observation.trajectoryState !== "POSSIBLE_DEVIATION" && observation.trajectoryState !== "DEVIATING") {
    return { status: "UNSCORABLE", correct: null, lifecycleKey: null, outcomeType: null };
  }

  const positive = events
    .filter((event) =>
      TRAJECTORY_POSITIVE_OUTCOME_TYPES.includes(event.type as typeof TRAJECTORY_POSITIVE_OUTCOME_TYPES[number])
      && sameIdentity(observation, event)
      && confident(event)
      && event.occurredAt >= observation.predictedAt
      && event.occurredAt - observation.predictedAt <= PREDICTIVE_OUTCOME_MATCH_AFTER_MS)
    .sort((left, right) => left.occurredAt - right.occurredAt)[0] ?? null;

  if (positive) {
    return {
      status: "SCORED",
      correct: true,
      lifecycleKey: positive.lifecycleKey,
      outcomeType: positive.type,
    };
  }

  const destinationIcao = normalizedIcao(observation.destinationIcao);
  if (!destinationIcao) return { status: "UNSCORABLE", correct: null, lifecycleKey: null, outcomeType: null };

  const cleanLanding = events
    .filter((event) =>
      event.type === "LANDING"
      && sameIdentity(observation, event)
      && event.groundConfirmedAt !== null
      && normalizedIcao(event.airportIcao) === destinationIcao
      && event.occurredAt >= observation.predictedAt
      && event.occurredAt - observation.predictedAt <= PREDICTIVE_OUTCOME_MATCH_AFTER_MS)
    .sort((left, right) => left.occurredAt - right.occurredAt)[0] ?? null;

  if (!cleanLanding) return { status: "UNSCORABLE", correct: null, lifecycleKey: null, outcomeType: null };

  return {
    status: "SCORED",
    correct: false,
    lifecycleKey: cleanLanding.lifecycleKey,
    outcomeType: "CLEAN_LANDING",
  };
}
