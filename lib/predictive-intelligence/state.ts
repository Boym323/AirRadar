import { evaluatePredictiveIntelligence } from "./engine";
import type { PredictiveInput, PredictiveFlightState } from "./types";

const MAX_ENTRIES = 2_000;
const STALE_MS = 30 * 60_000;
export class PredictiveStateStore {
  private readonly states = new Map<string, PredictiveFlightState>();
  private evaluations = 0;
  private errors = 0;
  evaluate(input: PredictiveInput): PredictiveFlightState | null {
    try {
      const previous = this.states.get(input.flightState.aircraftIcao);
      const result = evaluatePredictiveIntelligence({ ...input, previousPrediction: input.previousPrediction ?? previous });
      this.states.set(input.flightState.aircraftIcao, result.prediction);
      this.evaluations += 1;
      while (this.states.size > MAX_ENTRIES) this.states.delete(this.states.keys().next().value!);
      return result.prediction;
    } catch { this.errors += 1; return null; }
  }
  get(icao: string): PredictiveFlightState | null { return this.states.get(icao.toUpperCase()) ?? null; }
  forget(icao: string): void { this.states.delete(icao.toUpperCase()); }
  cleanup(now: number): void { for (const [key, value] of this.states) if (now - value.evaluatedAt > STALE_MS) this.states.delete(key); }
  diagnostics() { return { modelVersion: "predictive-intelligence-v1", stateEntries: this.states.size, maximumEntries: MAX_ENTRIES, evaluations: this.evaluations, errors: this.errors, persistence: "none" as const }; }
}
