import { evaluatePredictiveIntelligence } from "./engine";
import type { PredictionAirport, PredictionRunway, PredictionSample, PredictiveFlightState } from "./types";

export interface ReplayInput {
  samples: readonly PredictionSample[];
  destinationAirport: PredictionAirport | null;
  destination: string | null;
  destinationStatus: "KNOWN" | "INFERRED" | "UNKNOWN";
  runways?: readonly PredictionRunway[];
  /** Historical destination metadata must be resolved as-of each evaluation. */
  destinationAt?: (at: number) => { destination: string | null; status: "KNOWN" | "INFERRED" | "UNKNOWN"; airport: PredictionAirport | null };
}
export interface ReplayOutput { predictions: PredictiveFlightState[]; noLookAhead: "PASS"; }
export function replayPredictiveIntelligence(input: ReplayInput): ReplayOutput {
  const ordered = [...input.samples].sort((a, b) => a.observedAt - b.observedAt); const predictions: PredictiveFlightState[] = [];
  for (const sample of ordered) {
    const context = input.destinationAt?.(sample.observedAt);
    const result = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: "REPLAY", timestamp: sample.observedAt, phase: "UNKNOWN", sample, destination: context?.destination ?? input.destination, destinationStatus: context?.status ?? input.destinationStatus }, recentSamples: ordered.filter((candidate) => candidate.observedAt <= sample.observedAt), destinationAirport: context?.airport ?? input.destinationAirport, runways: input.runways, now: sample.observedAt });
    predictions.push(result.prediction);
  }
  return { predictions, noLookAhead: "PASS" };
}
