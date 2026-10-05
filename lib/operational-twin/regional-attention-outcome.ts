import type { Aircraft } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { haversineDistanceKm } from "@/lib/geo";
import type { OperationalAttentionSummary } from "./operational-attention";
import {
  REGIONAL_SITUATION_ELEVATED_HORIZONTAL_NM,
  REGIONAL_SITUATION_ELEVATED_VERTICAL_FT,
} from "./regional-situation";

export const REGIONAL_ATTENTION_OUTCOME_VERSION = "regional-attention-outcome-v1" as const;
export const REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES = [5, 15, 30] as const;
export const REGIONAL_ATTENTION_OUTCOME_WINDOW_MINUTES = 24 * 60;
export const REGIONAL_ATTENTION_OUTCOME_BUCKET_MINUTES = 5;

const KM_PER_NM = 1.852;
const CAPTURE_DEDUP_MS = 55_000;
const MIN_PREDICTION_LEAD_MINUTES = 1;
const TRUTH_EARLY_MS = 2 * 60_000;
const TRUTH_LATE_MS = 3 * 60_000;
const LOCAL_TRUTH_MAX_AGE_MS = 90_000;
const MAX_PENDING = 4_000;
const BUCKET_MS = REGIONAL_ATTENTION_OUTCOME_BUCKET_MINUTES * 60_000;
const WINDOW_MS = REGIONAL_ATTENTION_OUTCOME_WINDOW_MINUTES * 60_000;
const MAX_BUCKETS = Math.ceil(WINDOW_MS / BUCKET_MS) + 2;

export const REGIONAL_ATTENTION_OUTCOME_THRESHOLDS = {
  version: REGIONAL_ATTENTION_OUTCOME_VERSION,
  minimumSpanMinutes: 120,
  minimumScoreableSamples: 40,
  minimumScoreablePerHorizon: 8,
  minimumPrecision: 0.65,
  maximumMeanAbsoluteTimingErrorSeconds: 300,
  maximumMissingTruthRate: 0.35,
} as const;

export type RegionalAttentionOutcomeDecision = "PASS" | "WAIT" | "FAIL";
export type RegionalAttentionOutcomeReason =
  | "process_window_insufficient"
  | "scoreable_samples_insufficient"
  | "horizon_samples_insufficient"
  | "precision_low"
  | "timing_error_high"
  | "truth_coverage_low";

type Horizon = typeof REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES[number];

interface PendingRegionalAttentionOutcome {
  id: string;
  source: string;
  target: string;
  capturedAt: number;
  targetAt: number;
  earlyAt: number;
  expiresAt: number;
  horizon: Horizon;
  sawScoreableTruth: boolean;
}

interface Aggregate {
  predictions: number;
  observed: number;
  falsePositive: number;
  expiredNoTruth: number;
  timingSamples: number;
  absoluteTimingErrorSecondsSum: number;
  observedDistanceSamples: number;
  observedDistanceNmSum: number;
  observedVerticalSamples: number;
  observedVerticalFtSum: number;
}

interface OutcomeBucket {
  startMs: number;
  unscoredDestinationClusters: number;
  unscoredImmediateCopresence: number;
  byHorizon: Record<Horizon, Aggregate>;
}

export interface RegionalAttentionOutcomeCalibrationBucket {
  startMs: number;
  payloadJson: string;
}

export interface RegionalAttentionOutcomeSlice {
  predictions: number;
  scoreable: number;
  observed: number;
  falsePositive: number;
  precision: number | null;
  expiredNoTruth: number;
  missingTruthRate: number | null;
  truthCoverage: number | null;
  timingSamples: number;
  meanAbsoluteTimingErrorSeconds: number | null;
  observedDistanceSamples: number;
  meanObservedDistanceNm: number | null;
  observedVerticalSamples: number;
  meanObservedVerticalFt: number | null;
}

export interface RegionalAttentionOutcomeReport {
  version: typeof REGIONAL_ATTENTION_OUTCOME_VERSION;
  generatedAt: string;
  decision: RegionalAttentionOutcomeDecision;
  reasons: RegionalAttentionOutcomeReason[];
  complete: boolean;
  thresholds: typeof REGIONAL_ATTENTION_OUTCOME_THRESHOLDS;
  truthSource: "LOCAL_RECEIVER_PAIR_STATE";
  requestDrivenCapture: true;
  scoredType: "REGIONAL_COPRESENCE";
  unscoredType: "DESTINATION_CLUSTER";
  horizonsMinutes: readonly Horizon[];
  truthWindowMinutes: { early: number; late: number };
  elevatedTruthThresholds: {
    horizontalNm: number;
    verticalFt: number;
  };
  window: {
    from: string;
    to: string;
    spanMinutes: number;
    bucketMinutes: number;
    buckets: number;
    restartStableAggregates: true;
  };
  pending: number;
  duplicateCaptureSkips: number;
  capacityEvictions: number;
  unscoredDestinationClusters: number;
  unscoredImmediateCopresence: number;
  overall: RegionalAttentionOutcomeSlice;
  horizons: Record<string, RegionalAttentionOutcomeSlice>;
  limitations: readonly [
    "OPERATIONAL_CONTEXT_ONLY",
    "NOT_COLLISION_WARNING",
    "NOT_SEPARATION_PRODUCT",
    "DESTINATION_CLUSTER_UNSCORED",
  ];
}

export interface RegionalAttentionOutcomeDecisionInput {
  spanMinutes: number;
  overall: RegionalAttentionOutcomeSlice;
  horizons: RegionalAttentionOutcomeSlice[];
}

function emptyAggregate(): Aggregate {
  return {
    predictions: 0,
    observed: 0,
    falsePositive: 0,
    expiredNoTruth: 0,
    timingSamples: 0,
    absoluteTimingErrorSecondsSum: 0,
    observedDistanceSamples: 0,
    observedDistanceNmSum: 0,
    observedVerticalSamples: 0,
    observedVerticalFtSum: 0,
  };
}

function horizonRecord(): Record<Horizon, Aggregate> {
  return {
    5: emptyAggregate(),
    15: emptyAggregate(),
    30: emptyAggregate(),
  };
}

function addAggregate(target: Aggregate, source: Aggregate): void {
  target.predictions += source.predictions;
  target.observed += source.observed;
  target.falsePositive += source.falsePositive;
  target.expiredNoTruth += source.expiredNoTruth;
  target.timingSamples += source.timingSamples;
  target.absoluteTimingErrorSecondsSum += source.absoluteTimingErrorSecondsSum;
  target.observedDistanceSamples += source.observedDistanceSamples;
  target.observedDistanceNmSum += source.observedDistanceNmSum;
  target.observedVerticalSamples += source.observedVerticalSamples;
  target.observedVerticalFtSum += source.observedVerticalFtSum;
}

function toSlice(value: Aggregate): RegionalAttentionOutcomeSlice {
  const scoreable = value.observed + value.falsePositive;
  const truthTotal = scoreable + value.expiredNoTruth;
  const missingTruthRate = truthTotal ? value.expiredNoTruth / truthTotal : null;
  return {
    predictions: value.predictions,
    scoreable,
    observed: value.observed,
    falsePositive: value.falsePositive,
    precision: scoreable ? Number((value.observed / scoreable).toFixed(4)) : null,
    expiredNoTruth: value.expiredNoTruth,
    missingTruthRate: missingTruthRate === null ? null : Number(missingTruthRate.toFixed(4)),
    truthCoverage: missingTruthRate === null ? null : Number((1 - missingTruthRate).toFixed(4)),
    timingSamples: value.timingSamples,
    meanAbsoluteTimingErrorSeconds: value.timingSamples
      ? Number((value.absoluteTimingErrorSecondsSum / value.timingSamples).toFixed(1))
      : null,
    observedDistanceSamples: value.observedDistanceSamples,
    meanObservedDistanceNm: value.observedDistanceSamples
      ? Number((value.observedDistanceNmSum / value.observedDistanceSamples).toFixed(2))
      : null,
    observedVerticalSamples: value.observedVerticalSamples,
    meanObservedVerticalFt: value.observedVerticalSamples
      ? Math.round(value.observedVerticalFtSum / value.observedVerticalSamples)
      : null,
  };
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function persistedAggregate(value: unknown): Aggregate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Aggregate>;
  const result = emptyAggregate();
  for (const key of Object.keys(result) as Array<keyof Aggregate>) {
    const current = item[key];
    if (!nonNegativeFinite(current)) return null;
    result[key] = current;
  }
  return result;
}

function persistedBucket(payloadJson: string, expectedStartMs: number): OutcomeBucket | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const item = parsed as Partial<OutcomeBucket>;
  if (item.startMs !== expectedStartMs || expectedStartMs % BUCKET_MS !== 0) return null;
  if (!nonNegativeFinite(item.unscoredDestinationClusters) || !nonNegativeFinite(item.unscoredImmediateCopresence)) {
    return null;
  }
  if (!item.byHorizon || typeof item.byHorizon !== "object") return null;
  const byHorizon = horizonRecord();
  for (const horizon of REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES) {
    const aggregate = persistedAggregate((item.byHorizon as Record<number, unknown>)[horizon]);
    if (!aggregate) return null;
    byHorizon[horizon] = aggregate;
  }
  return {
    startMs: expectedStartMs,
    unscoredDestinationClusters: item.unscoredDestinationClusters,
    unscoredImmediateCopresence: item.unscoredImmediateCopresence,
    byHorizon,
  };
}

function horizonForOffset(offsetMinutes: number): Horizon | null {
  if (!Number.isFinite(offsetMinutes) || offsetMinutes < MIN_PREDICTION_LEAD_MINUTES || offsetMinutes > 30) return null;
  if (offsetMinutes <= 5) return 5;
  if (offsetMinutes <= 15) return 15;
  return 30;
}

function altitudeFt(aircraft: Aircraft): number | null {
  const value = aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function livePosition(aircraft: Aircraft | undefined, now: number): {
  lat: number;
  lon: number;
  altitudeFt: number;
} | null {
  if (!aircraft || aircraft.lat === null || aircraft.lon === null) return null;
  if (!Number.isFinite(aircraft.lat) || !Number.isFinite(aircraft.lon)) return null;
  const observedAt = positionObservedAt(aircraft);
  if (observedAt === null || Math.abs(now - observedAt) > LOCAL_TRUTH_MAX_AGE_MS) return null;
  const altitude = altitudeFt(aircraft);
  if (altitude === null) return null;
  return { lat: aircraft.lat, lon: aircraft.lon, altitudeFt: altitude };
}

export function evaluateRegionalAttentionOutcomeDecision(
  input: RegionalAttentionOutcomeDecisionInput,
): {
  decision: RegionalAttentionOutcomeDecision;
  reasons: RegionalAttentionOutcomeReason[];
  complete: boolean;
} {
  const reasons: RegionalAttentionOutcomeReason[] = [];
  if (input.spanMinutes < REGIONAL_ATTENTION_OUTCOME_THRESHOLDS.minimumSpanMinutes) {
    reasons.push("process_window_insufficient");
  }
  if (input.overall.scoreable < REGIONAL_ATTENTION_OUTCOME_THRESHOLDS.minimumScoreableSamples) {
    reasons.push("scoreable_samples_insufficient");
  }
  if (input.horizons.some((slice) =>
    slice.scoreable < REGIONAL_ATTENTION_OUTCOME_THRESHOLDS.minimumScoreablePerHorizon
  )) {
    reasons.push("horizon_samples_insufficient");
  }

  const complete = reasons.length === 0;
  if (complete) {
    if (
      input.overall.precision === null
      || input.overall.precision < REGIONAL_ATTENTION_OUTCOME_THRESHOLDS.minimumPrecision
    ) reasons.push("precision_low");
    if (
      input.overall.meanAbsoluteTimingErrorSeconds === null
      || input.overall.meanAbsoluteTimingErrorSeconds
        > REGIONAL_ATTENTION_OUTCOME_THRESHOLDS.maximumMeanAbsoluteTimingErrorSeconds
    ) reasons.push("timing_error_high");
    if (
      input.overall.missingTruthRate === null
      || input.overall.missingTruthRate > REGIONAL_ATTENTION_OUTCOME_THRESHOLDS.maximumMissingTruthRate
    ) reasons.push("truth_coverage_low");
  }
  return {
    decision: !complete ? "WAIT" : reasons.length ? "FAIL" : "PASS",
    reasons,
    complete,
  };
}

export class RegionalAttentionOutcomeValidator {
  private readonly pending = new Map<string, PendingRegionalAttentionOutcome>();
  private readonly lastCaptureAt = new Map<string, number>();
  private buckets: OutcomeBucket[] = [];
  private firstObservedAt: number | null = null;
  private duplicateCaptureSkips = 0;
  private capacityEvictions = 0;

  capture(summary: OperationalAttentionSummary, now = Date.parse(summary.generatedAt)): void {
    if (!Number.isFinite(now)) return;
    for (const item of summary.items) {
      if (item.type === "DESTINATION_CLUSTER") {
        this.bucketFor(now).unscoredDestinationClusters += 1;
        continue;
      }
      if (item.type !== "REGIONAL_COPRESENCE" || item.aircraft.length !== 2) continue;
      const offsetMinutes = item.projectedOffsetMinutes;
      const horizon = offsetMinutes === null ? null : horizonForOffset(offsetMinutes);
      if (horizon === null) {
        this.bucketFor(now).unscoredImmediateCopresence += 1;
        continue;
      }

      const [source, target] = item.aircraft.map((value) => value.toUpperCase()).sort();
      if (!source || !target || source === target) continue;
      const key = `${source}:${target}`;
      const previous = this.lastCaptureAt.get(key) ?? Number.NEGATIVE_INFINITY;
      if (now - previous < CAPTURE_DEDUP_MS) {
        this.duplicateCaptureSkips += 1;
        continue;
      }
      const targetAt = now + offsetMinutes! * 60_000;
      const id = `${key}:${now}`;
      this.pending.set(id, {
        id,
        source,
        target,
        capturedAt: now,
        targetAt,
        earlyAt: Math.max(now, targetAt - TRUTH_EARLY_MS),
        expiresAt: targetAt + TRUTH_LATE_MS,
        horizon,
        sawScoreableTruth: false,
      });
      this.lastCaptureAt.set(key, now);
      this.bucketFor(now).byHorizon[horizon].predictions += 1;
      this.firstObservedAt ??= now;
    }
    this.enforceCapacity();
    this.cleanup(now);
  }

  observeTruth(local: ReadonlyMap<string, Aircraft>, now = Date.now()): void {
    if (!Number.isFinite(now)) return;
    for (const sample of [...this.pending.values()]) {
      if (now < sample.earlyAt) continue;
      if (now > sample.expiresAt) {
        this.resolveExpired(sample);
        continue;
      }

      const source = livePosition(local.get(sample.source), now);
      const target = livePosition(local.get(sample.target), now);
      if (!source || !target) continue;
      sample.sawScoreableTruth = true;

      const horizontalNm = haversineDistanceKm(source.lat, source.lon, target.lat, target.lon) / KM_PER_NM;
      const verticalFt = Math.abs(source.altitudeFt - target.altitudeFt);
      if (
        horizontalNm <= REGIONAL_SITUATION_ELEVATED_HORIZONTAL_NM
        && verticalFt <= REGIONAL_SITUATION_ELEVATED_VERTICAL_FT
      ) {
        this.resolveObserved(sample, now, horizontalNm, verticalFt);
      }
    }
    this.cleanup(now);
  }

  report(now = new Date()): RegionalAttentionOutcomeReport {
    const nowMs = now.getTime();
    this.expire(nowMs);
    this.cleanup(nowMs);
    const cutoff = nowMs - WINDOW_MS;
    const buckets = this.buckets.filter((bucket) => bucket.startMs + BUCKET_MS > cutoff);
    const overallAggregate = emptyAggregate();
    const horizonAggregates = horizonRecord();
    let unscoredDestinationClusters = 0;
    let unscoredImmediateCopresence = 0;

    for (const bucket of buckets) {
      unscoredDestinationClusters += bucket.unscoredDestinationClusters;
      unscoredImmediateCopresence += bucket.unscoredImmediateCopresence;
      for (const horizon of REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES) {
        addAggregate(horizonAggregates[horizon], bucket.byHorizon[horizon]);
        addAggregate(overallAggregate, bucket.byHorizon[horizon]);
      }
    }

    const overall = toSlice(overallAggregate);
    const horizons = Object.fromEntries(
      REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES.map((horizon) => [
        String(horizon),
        toSlice(horizonAggregates[horizon]),
      ]),
    ) as Record<string, RegionalAttentionOutcomeSlice>;
    const firstBucket = buckets[0]?.startMs ?? nowMs;
    const first = Math.max(cutoff, Math.min(this.firstObservedAt ?? firstBucket, firstBucket));
    const spanMinutes = Math.max(0, Math.min(
      REGIONAL_ATTENTION_OUTCOME_WINDOW_MINUTES,
      (nowMs - first) / 60_000,
    ));
    const decision = evaluateRegionalAttentionOutcomeDecision({
      spanMinutes,
      overall,
      horizons: REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES.map((horizon) => horizons[String(horizon)]!),
    });

    return {
      version: REGIONAL_ATTENTION_OUTCOME_VERSION,
      generatedAt: now.toISOString(),
      ...decision,
      thresholds: REGIONAL_ATTENTION_OUTCOME_THRESHOLDS,
      truthSource: "LOCAL_RECEIVER_PAIR_STATE",
      requestDrivenCapture: true,
      scoredType: "REGIONAL_COPRESENCE",
      unscoredType: "DESTINATION_CLUSTER",
      horizonsMinutes: REGIONAL_ATTENTION_OUTCOME_HORIZONS_MINUTES,
      truthWindowMinutes: { early: TRUTH_EARLY_MS / 60_000, late: TRUTH_LATE_MS / 60_000 },
      elevatedTruthThresholds: {
        horizontalNm: REGIONAL_SITUATION_ELEVATED_HORIZONTAL_NM,
        verticalFt: REGIONAL_SITUATION_ELEVATED_VERTICAL_FT,
      },
      window: {
        from: new Date(Math.max(cutoff, firstBucket)).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        bucketMinutes: REGIONAL_ATTENTION_OUTCOME_BUCKET_MINUTES,
        buckets: buckets.length,
        restartStableAggregates: true,
      },
      pending: [...this.pending.values()].filter((sample) => sample.capturedAt >= cutoff).length,
      duplicateCaptureSkips: this.duplicateCaptureSkips,
      capacityEvictions: this.capacityEvictions,
      unscoredDestinationClusters,
      unscoredImmediateCopresence,
      overall,
      horizons,
      limitations: [
        "OPERATIONAL_CONTEXT_ONLY",
        "NOT_COLLISION_WARNING",
        "NOT_SEPARATION_PRODUCT",
        "DESTINATION_CLUSTER_UNSCORED",
      ],
    };
  }

  exportCalibrationBuckets(now = Date.now()): RegionalAttentionOutcomeCalibrationBucket[] {
    this.expire(now);
    this.cleanup(now);
    const cutoff = now - WINDOW_MS;
    return this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .map((bucket) => ({
        startMs: bucket.startMs,
        payloadJson: JSON.stringify(bucket),
      }));
  }

  hydrateCalibrationBuckets(
    rows: readonly RegionalAttentionOutcomeCalibrationBucket[],
    now = Date.now(),
  ): number {
    const cutoff = now - WINDOW_MS;
    let hydrated = 0;
    for (const row of rows) {
      if (!Number.isFinite(row.startMs) || row.startMs + BUCKET_MS <= cutoff) continue;
      const bucket = persistedBucket(row.payloadJson, row.startMs);
      if (!bucket) continue;
      const existing = this.buckets.findIndex((candidate) => candidate.startMs === bucket.startMs);
      if (existing >= 0) this.buckets[existing] = bucket;
      else this.buckets.push(bucket);
      hydrated += 1;
    }
    this.buckets = this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .sort((left, right) => left.startMs - right.startMs)
      .slice(-MAX_BUCKETS);
    const earliest = this.buckets[0]?.startMs ?? null;
    if (earliest !== null) this.firstObservedAt = Math.min(this.firstObservedAt ?? earliest, earliest);
    return hydrated;
  }

  reset(): void {
    this.pending.clear();
    this.lastCaptureAt.clear();
    this.buckets = [];
    this.firstObservedAt = null;
    this.duplicateCaptureSkips = 0;
    this.capacityEvictions = 0;
  }

  private resolveObserved(
    sample: PendingRegionalAttentionOutcome,
    occurredAt: number,
    horizontalNm: number,
    verticalFt: number,
  ): void {
    const aggregate = this.bucketFor(sample.capturedAt).byHorizon[sample.horizon];
    aggregate.observed += 1;
    aggregate.timingSamples += 1;
    aggregate.absoluteTimingErrorSecondsSum += Math.abs(occurredAt - sample.targetAt) / 1_000;
    aggregate.observedDistanceSamples += 1;
    aggregate.observedDistanceNmSum += horizontalNm;
    aggregate.observedVerticalSamples += 1;
    aggregate.observedVerticalFtSum += verticalFt;
    this.pending.delete(sample.id);
  }

  private resolveExpired(sample: PendingRegionalAttentionOutcome): void {
    const aggregate = this.bucketFor(sample.capturedAt).byHorizon[sample.horizon];
    if (sample.sawScoreableTruth) aggregate.falsePositive += 1;
    else aggregate.expiredNoTruth += 1;
    this.pending.delete(sample.id);
  }

  private expire(now: number): void {
    for (const sample of [...this.pending.values()]) {
      if (now > sample.expiresAt) this.resolveExpired(sample);
    }
  }

  private bucketFor(timestamp: number): OutcomeBucket {
    const startMs = Math.floor(timestamp / BUCKET_MS) * BUCKET_MS;
    let bucket = this.buckets.find((candidate) => candidate.startMs === startMs);
    if (!bucket) {
      bucket = {
        startMs,
        unscoredDestinationClusters: 0,
        unscoredImmediateCopresence: 0,
        byHorizon: horizonRecord(),
      };
      this.buckets.push(bucket);
      this.buckets.sort((left, right) => left.startMs - right.startMs);
    }
    return bucket;
  }

  private enforceCapacity(): void {
    while (this.pending.size > MAX_PENDING) {
      const oldest = [...this.pending.values()].sort((left, right) => left.capturedAt - right.capturedAt)[0];
      if (!oldest) break;
      this.pending.delete(oldest.id);
      this.capacityEvictions += 1;
    }
  }

  private cleanup(now: number): void {
    const cutoff = now - WINDOW_MS - TRUTH_LATE_MS;
    this.buckets = this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .slice(-MAX_BUCKETS);
    for (const [key, at] of this.lastCaptureAt) {
      if (at < now - WINDOW_MS) this.lastCaptureAt.delete(key);
    }
  }
}
