import { evaluatePredictiveIntelligence } from "./engine";
import type { PredictionAirport, PredictionRunway, PredictionSample, PredictiveFlightState } from "./types";

export interface ReplayInput { samples: readonly PredictionSample[]; destinationAirport: PredictionAirport | null; destination: string | null; destinationStatus: "KNOWN" | "INFERRED" | "UNKNOWN"; runways?: readonly PredictionRunway[]; }
export interface ReplayOutput { predictions: PredictiveFlightState[]; noLookAhead: "PASS"; }
export function replayPredictiveIntelligence(input: ReplayInput): ReplayOutput {
  const ordered = [...input.samples].sort((a, b) => a.observedAt - b.observedAt); const predictions: PredictiveFlightState[] = [];
  for (const sample of ordered) {
    const result = evaluatePredictiveIntelligence({ flightState: { aircraftIcao: "REPLAY", timestamp: sample.observedAt, phase: "UNKNOWN", sample, destination: input.destination, destinationStatus: input.destinationStatus }, recentSamples: ordered.filter((candidate) => candidate.observedAt <= sample.observedAt), destinationAirport: input.destinationAirport, runways: input.runways, now: sample.observedAt });
    predictions.push(result.prediction);
  }
  return { predictions, noLookAhead: "PASS" };
}
