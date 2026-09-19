import { logger } from "@/lib/server/logger";

export const ATC_PREDICTION_SUPPRESSION_REASONS = [
  "ground", "slow", "missing_track", "stale", "invalid_position",
  "no_stable_next_sector", "outside_coverage", "other",
] as const;

export type AtcPredictionSuppressionReason = typeof ATC_PREDICTION_SUPPRESSION_REASONS[number];
export interface AtcPredictionClassificationInput {
  currentSector: string | null;
  hasNextSector: boolean;
  onGround: boolean;
  observedAtMs: number;
  seenPosSeconds?: number | null;
  nowMs?: number;
  lat: number | null;
  lon: number | null;
  track: number | null;
  groundSpeed: number | null;
  currentAirspaces: number;
}

/** Shared suppression semantics for selected-aircraft and shadow evaluation. */
export function classifyAtcPrediction(input: AtcPredictionClassificationInput): AtcPredictionSuppressionReason | undefined {
  const now = input.nowMs ?? Date.now();
  const ageMs = Number.isFinite(input.observedAtMs) ? Math.max(0, now - input.observedAtMs) : Number.POSITIVE_INFINITY;
  if (input.currentSector === null) return "outside_coverage";
  if (input.hasNextSector) return undefined;
  if (input.onGround) return "ground";
  if (ageMs > 120_000 || (input.seenPosSeconds !== null && input.seenPosSeconds !== undefined && input.seenPosSeconds > 120)) return "stale";
  if (!Number.isFinite(input.lat ?? Number.NaN) || !Number.isFinite(input.lon ?? Number.NaN)) return "invalid_position";
  if (input.track === null) return "missing_track";
  if (input.groundSpeed === null || input.groundSpeed <= 20) return "slow";
  if (input.currentAirspaces === 0) return "outside_coverage";
  return "no_stable_next_sector";
}

type Prediction = { fromSector: string; predictedSector: string; createdAtMs: number; predictedAtMs: number };
type AircraftValidationState = { currentSector: string | null; pendingSector: string | null; pendingCount: number; prediction: Prediction | null; lastTouchedMs: number };

export interface AtcPredictionValidationSnapshot {
  attempts: number;
  created: number;
  suppressed: number;
  confirmed: number;
  changed: number;
  wrong: number;
  transitionWithoutPrediction: number;
  suppressionReasons: Record<AtcPredictionSuppressionReason, number>;
  confirmationRate: number | null;
  wrongPredictionRate: number | null;
  medianEtaErrorSeconds: number | null;
  p95EtaErrorSeconds: number | null;
  medianLeadTimeSeconds: number | null;
  p90LeadTimeSeconds: number | null;
  activeStates: number;
}

const MAX_STATES = 4096;
const MAX_SAMPLES = 4096;
const STATE_TTL_MS = 15 * 60_000;
const MAX_PREDICTION_AGE_MS = 5 * 60_000;

function emptyReasons(): Record<AtcPredictionSuppressionReason, number> {
  return Object.fromEntries(ATC_PREDICTION_SUPPRESSION_REASONS.map((reason) => [reason, 0])) as Record<AtcPredictionSuppressionReason, number>;
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? null;
}

export class AtcPredictionValidation {
  private readonly states = new Map<string, AircraftValidationState>();
  private readonly etaErrors: number[] = [];
  private readonly leadTimes: number[] = [];
  private attempts = 0;
  private created = 0;
  private suppressed = 0;
  private confirmed = 0;
  private changed = 0;
  private wrong = 0;
  private transitionWithoutPrediction = 0;
  private readonly suppressionReasons = emptyReasons();

  observePrediction(input: {
    hex: string;
    currentSector: string | null;
    predictedSector: string | null;
    predictedEtaSeconds: number | null;
    suppressionReason?: AtcPredictionSuppressionReason;
    now?: number;
  }): void {
    const now = input.now ?? Date.now();
    this.cleanup(now);
    const state = this.stateFor(input.hex, now);
    this.attempts += 1;
    if (input.suppressionReason) {
      this.suppressed += 1;
      this.suppressionReasons[input.suppressionReason] += 1;
    }
    const usable = input.currentSector !== null && input.predictedSector !== null
      && input.currentSector !== input.predictedSector && input.predictedEtaSeconds !== null
      && Number.isFinite(input.predictedEtaSeconds);
    if (!usable) {
      if (state.prediction) {
        this.changed += 1;
        logger.debug({ event: "atc_prediction_changed", change: "withdrawn", fromSector: state.prediction.fromSector, predictedSector: state.prediction.predictedSector }, "ATC prediction withdrawn");
        state.prediction = null;
      }
      return;
    }
    const prediction: Prediction = { fromSector: input.currentSector!, predictedSector: input.predictedSector!, createdAtMs: now, predictedAtMs: now + input.predictedEtaSeconds! * 1000 };
    if (!state.prediction) {
      this.created += 1;
      state.prediction = prediction;
      logger.debug({ event: "atc_prediction_created", fromSector: prediction.fromSector, predictedSector: prediction.predictedSector }, "ATC prediction created");
    } else if (state.prediction.fromSector !== prediction.fromSector || state.prediction.predictedSector !== prediction.predictedSector) {
      this.changed += 1;
      logger.debug({ event: "atc_prediction_changed", change: "changed_to_other_sector", fromSector: prediction.fromSector, predictedSector: prediction.predictedSector }, "ATC prediction changed");
      state.prediction = prediction;
    } else {
      state.prediction.predictedAtMs = prediction.predictedAtMs;
    }
  }

  observeCurrentSector(hex: string, nextSector: string | null, now = Date.now()): void {
    this.cleanup(now);
    const state = this.stateFor(hex, now);
    const previous = state.currentSector;
    if (previous === null) {
      state.currentSector = nextSector;
      state.pendingSector = null;
      state.pendingCount = 0;
      return;
    }
    if (nextSector !== previous) {
      state.pendingCount = state.pendingSector === nextSector ? state.pendingCount + 1 : 1;
      state.pendingSector = nextSector;
      if (state.pendingCount < 2) return;
      state.pendingSector = null;
      state.pendingCount = 0;
    } else {
      state.pendingSector = null;
      state.pendingCount = 0;
    }
    state.currentSector = nextSector;
    if (!previous || !nextSector || previous === nextSector) return;
    const prediction = state.prediction;
    if (!prediction || prediction.fromSector !== previous) {
      this.transitionWithoutPrediction += 1;
      return;
    }
    const leadTimeSeconds = Math.max(0, (now - prediction.createdAtMs) / 1000);
    this.leadTimes.push(leadTimeSeconds);
    if (prediction.predictedSector === nextSector) {
      this.confirmed += 1;
      this.etaErrors.push(Math.abs((now - prediction.predictedAtMs) / 1000));
      logger.info({ event: "atc_prediction_confirmed", fromSector: previous, predictedSector: prediction.predictedSector, actualSector: nextSector, leadTimeSeconds, etaErrorSeconds: this.etaErrors.at(-1) }, "ATC prediction confirmed");
    } else {
      this.wrong += 1;
      logger.info({ event: "atc_prediction_wrong", fromSector: previous, predictedSector: prediction.predictedSector, actualSector: nextSector, leadTimeSeconds }, "ATC prediction wrong");
    }
    state.prediction = null;
  }

  remove(hex: string): void { this.states.delete(hex); }

  getCurrentSector(hex: string): string | null {
    return this.states.get(hex)?.currentSector ?? null;
  }

  getSnapshot(now = Date.now()): AtcPredictionValidationSnapshot {
    this.cleanup(now);
    const resolved = this.confirmed + this.wrong;
    return {
      attempts: this.attempts, created: this.created, suppressed: this.suppressed, confirmed: this.confirmed,
      changed: this.changed, wrong: this.wrong, transitionWithoutPrediction: this.transitionWithoutPrediction,
      suppressionReasons: { ...this.suppressionReasons },
      confirmationRate: resolved ? this.confirmed / resolved : null,
      wrongPredictionRate: resolved ? this.wrong / resolved : null,
      medianEtaErrorSeconds: percentile(this.etaErrors, 0.5), p95EtaErrorSeconds: percentile(this.etaErrors, 0.95),
      medianLeadTimeSeconds: percentile(this.leadTimes, 0.5), p90LeadTimeSeconds: percentile(this.leadTimes, 0.9),
      activeStates: this.states.size,
    };
  }

  private stateFor(hex: string, now: number): AircraftValidationState {
    let state = this.states.get(hex);
    if (!state) {
      if (this.states.size >= MAX_STATES) this.states.delete(this.states.keys().next().value!);
      state = { currentSector: null, pendingSector: null, pendingCount: 0, prediction: null, lastTouchedMs: now };
      this.states.set(hex, state);
    }
    state.lastTouchedMs = now;
    return state;
  }

  private cleanup(now: number): void {
    for (const [hex, state] of this.states) {
      if (now - state.lastTouchedMs > STATE_TTL_MS || (state.prediction && now - state.prediction.createdAtMs > MAX_PREDICTION_AGE_MS)) {
        this.states.delete(hex);
      }
    }
    if (this.etaErrors.length > MAX_SAMPLES) this.etaErrors.splice(0, this.etaErrors.length - MAX_SAMPLES);
    if (this.leadTimes.length > MAX_SAMPLES) this.leadTimes.splice(0, this.leadTimes.length - MAX_SAMPLES);
  }
}

const globalForValidation = globalThis as unknown as { atcPredictionValidation?: AtcPredictionValidation };
export function getAtcPredictionValidation(): AtcPredictionValidation {
  globalForValidation.atcPredictionValidation ??= new AtcPredictionValidation();
  return globalForValidation.atcPredictionValidation;
}
