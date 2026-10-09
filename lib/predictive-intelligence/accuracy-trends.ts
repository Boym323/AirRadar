// Read-only analytics over the existing bounded prospective readiness cohort.
// Values here do not participate in public graduation or prediction serialization.
export const PREDICTIVE_ACCURACY_TRENDS_VERSION = "predictive-accuracy-trends-v1" as const;
export const PREDICTIVE_TREND_PERIOD_DAYS = 7 as const;
export const PREDICTIVE_TREND_MINIMUM_CONFIRMED_FLIGHTS = 20 as const;
const PERIOD_MS = PREDICTIVE_TREND_PERIOD_DAYS * 86_400_000;

export type PredictiveTrendCapability = "ETA" | "RUNWAY";
export type PredictiveTrendState =
  | "SOURCE_UNAVAILABLE"
  | "COLLECTION_INCOMPLETE"
  | "INSUFFICIENT_TRUTH"
  | "COMPARABLE";

export interface PredictiveTrendSample {
  capability: PredictiveTrendCapability;
  lifecycleKey: string;
  observationKey: string;
  predictedAtMs: number | null;
  // These scores must be computed using the canonical independent landing
  // truth matcher and scoring functions from predictive-readiness.ts.
  scored: boolean;
  etaAbsoluteErrorSeconds?: number | null;
  runwayExactEnd?: boolean | null;
  destinationIcao?: string | null;
  flightPhase?: string | null;
  predictionConfidence?: string | null;
}

export interface PredictiveTrendPeriod {
  from: string;
  to: string;
  observedFlights: number;
  scoreableFlights: number;
  unscorableFlights: number;
  etaMaeSeconds: number | null;
  etaMedianAbsoluteErrorSeconds: number | null;
  etaP90AbsoluteErrorSeconds: number | null;
  runwayExactEndAccuracy: number | null;
}

export interface PredictiveTrendCapabilityReport {
  state: PredictiveTrendState;
  recent: PredictiveTrendPeriod;
  previous: PredictiveTrendPeriod;
  // Signed current minus previous: less ETA error and more runway accuracy
  // are improvements. Null until both periods contain enough truth.
  deltaEtaMaeSeconds: number | null;
  deltaRunwayAccuracyPercentagePoints: number | null;
}

export interface PredictiveAccuracyTrends {
  version: typeof PREDICTIVE_ACCURACY_TRENDS_VERSION;
  periodDays: typeof PREDICTIVE_TREND_PERIOD_DAYS;
  minimumConfirmedFlightsPerPeriod: typeof PREDICTIVE_TREND_MINIMUM_CONFIRMED_FLIGHTS;
  sourceAvailable: boolean;
  complete: boolean;
  capabilities: Record<PredictiveTrendCapability, PredictiveTrendCapabilityReport>;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
}

function summarize(
  samples: readonly PredictiveTrendSample[],
  capability: PredictiveTrendCapability,
  start: number,
  end: number,
): PredictiveTrendPeriod {
  const relevant = samples.filter((sample) =>
    sample.capability === capability
    && sample.predictedAtMs !== null
    && Number.isSafeInteger(sample.predictedAtMs)
    && sample.predictedAtMs >= start
    && sample.predictedAtMs < end);
  const scored = relevant.filter((sample) => sample.scored && (
    capability === "ETA"
      ? typeof sample.etaAbsoluteErrorSeconds === "number"
        && Number.isFinite(sample.etaAbsoluteErrorSeconds) && sample.etaAbsoluteErrorSeconds >= 0
      : typeof sample.runwayExactEnd === "boolean"
  ));
  const etaErrors = capability === "ETA"
    ? scored.map((sample) => sample.etaAbsoluteErrorSeconds as number)
    : [];
  const correctRunways = capability === "RUNWAY"
    ? scored.filter((sample) => sample.runwayExactEnd === true).length
    : 0;
  return {
    from: new Date(start).toISOString(),
    to: new Date(end).toISOString(),
    observedFlights: relevant.length,
    scoreableFlights: scored.length,
    unscorableFlights: relevant.length - scored.length,
    etaMaeSeconds: etaErrors.length ? etaErrors.reduce((sum, error) => sum + error, 0) / etaErrors.length : null,
    etaMedianAbsoluteErrorSeconds: percentile(etaErrors, 0.5),
    etaP90AbsoluteErrorSeconds: percentile(etaErrors, 0.9),
    runwayExactEndAccuracy: capability === "RUNWAY" && scored.length ? correctRunways / scored.length : null,
  };
}

export function buildPredictiveAccuracyTrends(
  samples: readonly PredictiveTrendSample[],
  options: { now: Date; sourceAvailable: boolean; complete: boolean },
): PredictiveAccuracyTrends {
  const end = options.now.getTime();
  const middle = end - PERIOD_MS;
  const start = middle - PERIOD_MS;

  // One earliest prospectively captured prediction per lifecycle and
  // capability across BOTH windows, not one sample per polling tick.
  // One flight cannot be counted in both periods, even at the boundary.
  const byFlight = new Map<string, PredictiveTrendSample>();
  for (const sample of samples) {
    const at = sample.predictedAtMs;
    if (!sample.lifecycleKey.trim() || at === null || !Number.isSafeInteger(at) || at < start || at >= end) continue;
    if (sample.capability !== "ETA" && sample.capability !== "RUNWAY") continue;
    const key = `${sample.capability}:${sample.lifecycleKey}`;
    const prior = byFlight.get(key);
    if (!prior || at < prior.predictedAtMs! || (at === prior.predictedAtMs && sample.observationKey < prior.observationKey)) {
      byFlight.set(key, sample);
    }
  }
  const selected = [...byFlight.values()];
  const capabilities = {} as Record<PredictiveTrendCapability, PredictiveTrendCapabilityReport>;
  for (const capability of ["ETA", "RUNWAY"] as const) {
    const recent = summarize(selected, capability, middle, end);
    const previous = summarize(selected, capability, start, middle);
    const state: PredictiveTrendState =
      !options.sourceAvailable ? "SOURCE_UNAVAILABLE"
        : !options.complete ? "COLLECTION_INCOMPLETE"
          : recent.scoreableFlights < PREDICTIVE_TREND_MINIMUM_CONFIRMED_FLIGHTS
            || previous.scoreableFlights < PREDICTIVE_TREND_MINIMUM_CONFIRMED_FLIGHTS
            ? "INSUFFICIENT_TRUTH" : "COMPARABLE";
    capabilities[capability] = {
      state,
      recent,
      previous,
      deltaEtaMaeSeconds: state === "COMPARABLE" && capability === "ETA"
        && recent.etaMaeSeconds !== null && previous.etaMaeSeconds !== null
        ? recent.etaMaeSeconds - previous.etaMaeSeconds : null,
      deltaRunwayAccuracyPercentagePoints: state === "COMPARABLE" && capability === "RUNWAY"
        && recent.runwayExactEndAccuracy !== null && previous.runwayExactEndAccuracy !== null
        ? (recent.runwayExactEndAccuracy - previous.runwayExactEndAccuracy) * 100 : null,
    };
  }
  return {
    version: PREDICTIVE_ACCURACY_TRENDS_VERSION,
    periodDays: PREDICTIVE_TREND_PERIOD_DAYS,
    minimumConfirmedFlightsPerPeriod: PREDICTIVE_TREND_MINIMUM_CONFIRMED_FLIGHTS,
    sourceAvailable: options.sourceAvailable,
    complete: options.complete,
    capabilities,
  };
}
