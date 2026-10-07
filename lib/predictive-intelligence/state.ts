import { evaluatePredictiveIntelligence } from "./engine";
import type { PredictiveInput, PredictiveFlightState } from "./types";
import { ProspectiveValidationWriter, prospectiveObservationFor, isProspectiveValidationEnabled } from "./prospective";

const MAX_ENTRIES = 2_000;
const STALE_MS = 30 * 60_000;
export class PredictiveStateStore {
  private readonly states = new Map<string, PredictiveFlightState>();
  private readonly prospective = new ProspectiveValidationWriter();
  private evaluations = 0;
  private errors = 0;
  evaluate(input: PredictiveInput): PredictiveFlightState | null {
    try {
      const stateKey = input.flightState.lifecycleKey ?? input.flightState.aircraftIcao;
      const previous = this.states.get(stateKey);
      const result = evaluatePredictiveIntelligence({ ...input, previousPrediction: input.previousPrediction ?? previous });
      this.states.set(stateKey, result.prediction);
      // Capture is deliberately downstream of the pure evaluator and is
      // fire-and-forget; the aircraft loop never waits on PostgreSQL.
      const aircraft = input.aircraft ?? input.flightState.aircraft;
      if (isProspectiveValidationEnabled() && input.flightState.lifecycleKey && aircraft) {
        this.prospective.enqueue(prospectiveObservationFor(
          aircraft,
          result.prediction,
          input.flightState.lifecycleKey,
          previous ?? input.previousPrediction ?? null,
          input.flightState.flightId ?? null,
        ));
      }
      this.evaluations += 1;
      while (this.states.size > MAX_ENTRIES) this.states.delete(this.states.keys().next().value!);
      return result.prediction;
    } catch { this.errors += 1; return null; }
  }
  get(icao: string): PredictiveFlightState | null {
    const normalized = icao.toUpperCase();
    const prefix = `${normalized}:`;
    let latest: PredictiveFlightState | null = null;
    for (const [key, value] of this.states) {
      if (key !== normalized && !key.startsWith(prefix)) continue;
      if (!latest || value.evaluatedAt > latest.evaluatedAt) latest = value;
    }
    return latest;
  }
  forget(icao: string): void { const prefix = `${icao.toUpperCase()}:`; for (const key of this.states.keys()) if (key === icao.toUpperCase() || key.startsWith(prefix)) this.states.delete(key); }
  cleanup(now: number): void { for (const [key, value] of this.states) if (now - value.evaluatedAt > STALE_MS) this.states.delete(key); }
  diagnostics() { return { modelVersion: "predictive-intelligence-v1", stateEntries: this.states.size, maximumEntries: MAX_ENTRIES, evaluations: this.evaluations, errors: this.errors, persistence: "none" as const, prospective: this.prospective.diagnostics() }; }
  async flushProspective(): Promise<void> { await this.prospective.flush(); }
}
