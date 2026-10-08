// Read-only ETA quality by independently confirmed time to touchdown.
// Does not influence public graduation, calibration or ETA forecasts.
export const PREDICTIVE_HORIZON_QUALITY_VERSION = "predictive-horizon-quality-v1" as const;
export const PREDICTIVE_HORIZON_MINIMUM_FLIGHTS = 10 as const;
export const PREDICTIVE_HORIZON_BUCKETS = ["0-5m", "5-15m", "15-30m", "30-60m", "60m+"] as const;
export type PredictiveHorizonBucket = typeof PREDICTIVE_HORIZON_BUCKETS[number];
export type PredictiveHorizonQualityState = "SOURCE_UNAVAILABLE" | "COLLECTION_INCOMPLETE" | "INSUFFICIENT_TRUTH" | "MEASURED";

export interface PredictiveHorizonObservation {
  observationKey: string;
  lifecycleKey: string;
  predictedAtMs: number | null;
  actualLandingAtMs: number | null;
  signedErrorSeconds: number | null;
}

export interface PredictiveHorizonBand {
  bucket: PredictiveHorizonBucket;
  state: PredictiveHorizonQualityState;
  flights: number;
  maeSeconds: number | null;
  medianAbsoluteErrorSeconds: number | null;
  p90AbsoluteErrorSeconds: number | null;
  biasSeconds: number | null;
}

export interface PredictiveHorizonQuality {
  version: typeof PREDICTIVE_HORIZON_QUALITY_VERSION;
  minimumConfirmedFlights: typeof PREDICTIVE_HORIZON_MINIMUM_FLIGHTS;
  sourceAvailable: boolean;
  complete: boolean;
  unclassifiedFlights: number;
  bands: PredictiveHorizonBand[];
}

function horizonBucket(minutes: number): PredictiveHorizonBucket | null {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 360) return null;
  if (minutes < 5) return "0-5m";
  if (minutes < 15) return "5-15m";
  if (minutes < 30) return "15-30m";
  if (minutes < 60) return "30-60m";
  return "60m+";
}

function percentile(values: number[], portion: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * portion) - 1)] ?? null;
}

export function buildPredictiveHorizonQuality(
  observations: readonly PredictiveHorizonObservation[],
  options: { sourceAvailable: boolean; complete: boolean },
): PredictiveHorizonQuality {
  // At most one forecast per lifecycle per horizon bucket, selected by
  // earliest prediction timestamp (not smallest eventual error).
  const earliest = new Map<string, PredictiveHorizonObservation>();
  const unclassified = new Set<string>();
  for (const item of observations) {
    if (!item.lifecycleKey.trim()) continue;
    const at = item.predictedAtMs;
    const actual = item.actualLandingAtMs;
    if (at === null || !Number.isSafeInteger(at)) continue;
    const bucket = actual === null || !Number.isSafeInteger(actual)
      ? null : horizonBucket((actual - at) / 60_000);
    if (!bucket || item.signedErrorSeconds === null || !Number.isFinite(item.signedErrorSeconds)) {
      unclassified.add(item.lifecycleKey);
      continue;
    }
    const key = `${bucket}:${item.lifecycleKey}`;
    const previous = earliest.get(key);
    if (!previous || at < previous.predictedAtMs! ||
      (at === previous.predictedAtMs && item.observationKey < previous.observationKey)) {
      earliest.set(key, item);
    }
  }

  const bands = PREDICTIVE_HORIZON_BUCKETS.map((bucket): PredictiveHorizonBand => {
    const errors = [...earliest.entries()]
      .filter(([key]) => key.startsWith(`${bucket}:`))
      .map(([, observation]) => observation.signedErrorSeconds!);
    const absolute = errors.map(Math.abs);
    const state: PredictiveHorizonQualityState =
      !options.sourceAvailable ? "SOURCE_UNAVAILABLE"
        : !options.complete ? "COLLECTION_INCOMPLETE"
          : errors.length < PREDICTIVE_HORIZON_MINIMUM_FLIGHTS ? "INSUFFICIENT_TRUTH" : "MEASURED";
    const visible = state === "MEASURED";
    return {
      bucket,
      state,
      flights: errors.length,
      maeSeconds: visible ? absolute.reduce((sum, value) => sum + value, 0) / absolute.length : null,
      medianAbsoluteErrorSeconds: visible ? percentile(absolute, 0.5) : null,
      p90AbsoluteErrorSeconds: visible ? percentile(absolute, 0.9) : null,
      biasSeconds: visible ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null,
    };
  });
  return {
    version: PREDICTIVE_HORIZON_QUALITY_VERSION,
    minimumConfirmedFlights: PREDICTIVE_HORIZON_MINIMUM_FLIGHTS,
    sourceAvailable: options.sourceAvailable,
    complete: options.complete,
    unclassifiedFlights: unclassified.size,
    bands,
  };
}
