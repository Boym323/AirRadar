import type { Aircraft } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import { haversineDistanceKm } from "@/lib/geo";
import type {
  OperationalTwinCorridorMode,
  OperationalTwinSituation,
  OperationalTwinTrajectoryPoint,
} from "./types";

export const OPERATIONAL_TWIN_OUTCOME_VERSION = "operational-digital-twin-outcome-validation-v1" as const;
export const OPERATIONAL_TWIN_OUTCOME_HORIZONS_MINUTES = [5, 15, 30] as const;
export const OPERATIONAL_TWIN_OUTCOME_WINDOW_MINUTES = 24 * 60;
export const OPERATIONAL_TWIN_OUTCOME_BUCKET_MINUTES = 5;

const KM_PER_NM = 1.852;
const MIN_CAPTURE_INTERVAL_MS = 55_000;
const TRUTH_TOLERANCE_MS = 20_000;
const TRUTH_GRACE_MS = 30_000;
const MAX_PENDING = 5_000;
const BUCKET_MS = OPERATIONAL_TWIN_OUTCOME_BUCKET_MINUTES * 60_000;
const WINDOW_MS = OPERATIONAL_TWIN_OUTCOME_WINDOW_MINUTES * 60_000;
const MAX_BUCKETS = Math.ceil(WINDOW_MS / BUCKET_MS) + 1;

export const OPERATIONAL_TWIN_OUTCOME_THRESHOLDS = {
  version: OPERATIONAL_TWIN_OUTCOME_VERSION,
  minimumSpanMinutes: 120,
  minimumSamples: 90,
  minimumSamplesPerHorizon: 20,
  minimumUncertaintyCoverage: 0.60,
  maximumMeanErrorToUncertaintyRatio: 1.00,
  maximumExpiredTruthRate: 0.35,
} as const;

export type OperationalTwinOutcomeDecision = "PASS" | "WAIT" | "FAIL";
export type OperationalTwinOutcomeReason =
  | "process_window_insufficient"
  | "samples_insufficient"
  | "horizon_samples_insufficient"
  | "uncertainty_coverage_low"
  | "mean_error_ratio_high"
  | "expired_truth_rate_high";

interface ProjectedTruthTarget {
  lat: number;
  lon: number;
  altitudeFt: number | null;
  uncertaintyNm: number;
}

interface PendingOutcomeSample {
  id: string;
  icaoHex: string;
  capturedAt: number;
  targetAt: number;
  expiresAt: number;
  horizonMinutes: number;
  mode: OperationalTwinCorridorMode;
  stateSource: OperationalTwinSituation["aircraft"]["stateSource"];
  predicted: ProjectedTruthTarget;
}

interface Aggregate {
  samples: number;
  positionErrorNmSum: number;
  uncertaintyNmSum: number;
  errorToUncertaintyRatioSum: number;
  insideUncertainty: number;
  altitudeSamples: number;
  altitudeErrorFtSum: number;
}

interface OutcomeBucket {
  startMs: number;
  created: number;
  completed: number;
  expiredWithoutTruth: number;
  byHorizon: Record<number, Aggregate>;
  byMode: Record<OperationalTwinCorridorMode, Aggregate>;
  byStateSource: Record<OperationalTwinSituation["aircraft"]["stateSource"], Aggregate>;
}


export interface OperationalTwinOutcomeCalibrationBucket {
  startMs: number;
  payloadJson: string;
}

function nonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function persistedAggregate(value: unknown): Aggregate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Aggregate>;
  const keys: Array<keyof Aggregate> = [
    "samples",
    "positionErrorNmSum",
    "uncertaintyNmSum",
    "errorToUncertaintyRatioSum",
    "insideUncertainty",
    "altitudeSamples",
    "altitudeErrorFtSum",
  ];
  if (!keys.every((key) => nonNegativeFinite(item[key]))) return null;
  return Object.fromEntries(keys.map((key) => [key, item[key]])) as unknown as Aggregate;
}

function persistedOutcomeBucket(payloadJson: string, expectedStartMs: number): OutcomeBucket | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const item = parsed as Partial<OutcomeBucket>;
  if (item.startMs !== expectedStartMs || expectedStartMs % BUCKET_MS !== 0) return null;
  if (!nonNegativeFinite(item.created) || !nonNegativeFinite(item.completed) || !nonNegativeFinite(item.expiredWithoutTruth)) return null;
  if (!item.byHorizon || !item.byMode || !item.byStateSource) return null;

  const byHorizon = Object.fromEntries(OPERATIONAL_TWIN_OUTCOME_HORIZONS_MINUTES.map((horizon) => {
    const aggregate = persistedAggregate((item.byHorizon as Record<number, unknown>)[horizon]);
    return [horizon, aggregate];
  }));
  if (Object.values(byHorizon).some((aggregate) => aggregate === null)) return null;

  const routeAware = persistedAggregate((item.byMode as Record<string, unknown>).ROUTE_AWARE);
  const kinematic = persistedAggregate((item.byMode as Record<string, unknown>).KINEMATIC);
  const canonical = persistedAggregate((item.byStateSource as Record<string, unknown>).CANONICAL);
  const trackFusion = persistedAggregate((item.byStateSource as Record<string, unknown>).TRACK_FUSION);
  if (!routeAware || !kinematic || !canonical || !trackFusion) return null;

  return {
    startMs: expectedStartMs,
    created: item.created,
    completed: item.completed,
    expiredWithoutTruth: item.expiredWithoutTruth,
    byHorizon: byHorizon as Record<number, Aggregate>,
    byMode: { ROUTE_AWARE: routeAware, KINEMATIC: kinematic },
    byStateSource: { CANONICAL: canonical, TRACK_FUSION: trackFusion },
  };
}

export interface OperationalTwinOutcomeSlice {
  samples: number;
  meanPositionErrorNm: number | null;
  meanUncertaintyNm: number | null;
  meanErrorToUncertaintyRatio: number | null;
  insideUncertainty: number;
  uncertaintyCoverage: number | null;
  altitudeSamples: number;
  meanAltitudeErrorFt: number | null;
}

export interface OperationalTwinOutcomeReport {
  version: typeof OPERATIONAL_TWIN_OUTCOME_VERSION;
  generatedAt: string;
  decision: OperationalTwinOutcomeDecision;
  reasons: OperationalTwinOutcomeReason[];
  complete: boolean;
  thresholds: typeof OPERATIONAL_TWIN_OUTCOME_THRESHOLDS;
  truthSource: "LOCAL_RECEIVER";
  requestDrivenCapture: true;
  horizonsMinutes: readonly number[];
  window: {
    from: string;
    to: string;
    spanMinutes: number;
    bucketMinutes: number;
    buckets: number;
    processLocal: true;
  };
  pending: number;
  created: number;
  completed: number;
  expiredWithoutTruth: number;
  expiredTruthRate: number | null;
  duplicateCaptureSkips: number;
  capacityEvictions: number;
  overall: OperationalTwinOutcomeSlice;
  horizons: Record<string, OperationalTwinOutcomeSlice>;
  modes: Record<OperationalTwinCorridorMode, OperationalTwinOutcomeSlice>;
  stateSources: Record<OperationalTwinSituation["aircraft"]["stateSource"], OperationalTwinOutcomeSlice>;
}

export interface OperationalTwinOutcomeDecisionInput {
  spanMinutes: number;
  overall: OperationalTwinOutcomeSlice;
  horizons: OperationalTwinOutcomeSlice[];
  expiredTruthRate: number | null;
}

function emptyAggregate(): Aggregate {
  return {
    samples: 0,
    positionErrorNmSum: 0,
    uncertaintyNmSum: 0,
    errorToUncertaintyRatioSum: 0,
    insideUncertainty: 0,
    altitudeSamples: 0,
    altitudeErrorFtSum: 0,
  };
}

function addAggregate(target: Aggregate, source: Aggregate): void {
  target.samples += source.samples;
  target.positionErrorNmSum += source.positionErrorNmSum;
  target.uncertaintyNmSum += source.uncertaintyNmSum;
  target.errorToUncertaintyRatioSum += source.errorToUncertaintyRatioSum;
  target.insideUncertainty += source.insideUncertainty;
  target.altitudeSamples += source.altitudeSamples;
  target.altitudeErrorFtSum += source.altitudeErrorFtSum;
}

function aggregateToSlice(value: Aggregate): OperationalTwinOutcomeSlice {
  return {
    samples: value.samples,
    meanPositionErrorNm: value.samples
      ? Number((value.positionErrorNmSum / value.samples).toFixed(3))
      : null,
    meanUncertaintyNm: value.samples
      ? Number((value.uncertaintyNmSum / value.samples).toFixed(3))
      : null,
    meanErrorToUncertaintyRatio: value.samples
      ? Number((value.errorToUncertaintyRatioSum / value.samples).toFixed(3))
      : null,
    insideUncertainty: value.insideUncertainty,
    uncertaintyCoverage: value.samples
      ? Number((value.insideUncertainty / value.samples).toFixed(4))
      : null,
    altitudeSamples: value.altitudeSamples,
    meanAltitudeErrorFt: value.altitudeSamples
      ? Math.round(value.altitudeErrorFtSum / value.altitudeSamples)
      : null,
  };
}

export function evaluateOperationalTwinOutcomeDecision(
  input: OperationalTwinOutcomeDecisionInput,
): { decision: OperationalTwinOutcomeDecision; reasons: OperationalTwinOutcomeReason[]; complete: boolean } {
  const reasons: OperationalTwinOutcomeReason[] = [];
  if (input.spanMinutes < OPERATIONAL_TWIN_OUTCOME_THRESHOLDS.minimumSpanMinutes) {
    reasons.push("process_window_insufficient");
  }
  if (input.overall.samples < OPERATIONAL_TWIN_OUTCOME_THRESHOLDS.minimumSamples) {
    reasons.push("samples_insufficient");
  }
  if (input.horizons.some((slice) => slice.samples < OPERATIONAL_TWIN_OUTCOME_THRESHOLDS.minimumSamplesPerHorizon)) {
    reasons.push("horizon_samples_insufficient");
  }

  const complete = reasons.length === 0;
  if (complete) {
    if (
      input.overall.uncertaintyCoverage === null
      || input.overall.uncertaintyCoverage < OPERATIONAL_TWIN_OUTCOME_THRESHOLDS.minimumUncertaintyCoverage
    ) {
      reasons.push("uncertainty_coverage_low");
    }
    if (
      input.overall.meanErrorToUncertaintyRatio === null
      || input.overall.meanErrorToUncertaintyRatio > OPERATIONAL_TWIN_OUTCOME_THRESHOLDS.maximumMeanErrorToUncertaintyRatio
    ) {
      reasons.push("mean_error_ratio_high");
    }
    if (
      input.expiredTruthRate === null
      || input.expiredTruthRate > OPERATIONAL_TWIN_OUTCOME_THRESHOLDS.maximumExpiredTruthRate
    ) {
      reasons.push("expired_truth_rate_high");
    }
  }

  return {
    decision: !complete ? "WAIT" : reasons.length ? "FAIL" : "PASS",
    reasons,
    complete,
  };
}

function interpolateLongitude(left: number, right: number, ratio: number): number {
  let delta = right - left;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  let value = left + delta * ratio;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

export function operationalTwinOutcomePointAt(
  points: readonly OperationalTwinTrajectoryPoint[],
  offsetMinutes: number,
): OperationalTwinTrajectoryPoint | null {
  if (!points.length || offsetMinutes < points[0]!.offsetMinutes || offsetMinutes > points.at(-1)!.offsetMinutes) {
    return null;
  }
  const exact = points.find((point) => point.offsetMinutes === offsetMinutes);
  if (exact) return exact;
  const upperIndex = points.findIndex((point) => point.offsetMinutes > offsetMinutes);
  if (upperIndex <= 0) return null;
  const lower = points[upperIndex - 1]!;
  const upper = points[upperIndex]!;
  const span = upper.offsetMinutes - lower.offsetMinutes;
  if (span <= 0) return lower;
  const ratio = (offsetMinutes - lower.offsetMinutes) / span;
  const lowerAt = Date.parse(lower.at);
  const upperAt = Date.parse(upper.at);
  const at = Number.isFinite(lowerAt) && Number.isFinite(upperAt)
    ? new Date(lowerAt + (upperAt - lowerAt) * ratio).toISOString()
    : lower.at;
  const altitudeFt = lower.altitudeFt === null || upper.altitudeFt === null
    ? lower.altitudeFt ?? upper.altitudeFt
    : lower.altitudeFt + (upper.altitudeFt - lower.altitudeFt) * ratio;

  return {
    offsetMinutes,
    at,
    lat: lower.lat + (upper.lat - lower.lat) * ratio,
    lon: interpolateLongitude(lower.lon, upper.lon, ratio),
    altitudeFt,
    trackDeg: lower.trackDeg ?? upper.trackDeg,
    uncertaintyNm: lower.uncertaintyNm + (upper.uncertaintyNm - lower.uncertaintyNm) * ratio,
    mode: lower.mode,
  };
}

interface TruthCandidate {
  at: number;
  lat: number;
  lon: number;
  altitudeFt: number | null;
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function currentAltitude(aircraft: Aircraft): number | null {
  if (finite(aircraft.baroAltitude)) return aircraft.baroAltitude;
  if (finite(aircraft.altitude)) return aircraft.altitude;
  if (finite(aircraft.geomAltitude)) return aircraft.geomAltitude;
  return null;
}

function truthCandidate(aircraft: Aircraft, targetAt: number): TruthCandidate | null {
  const candidates: TruthCandidate[] = [];
  for (const point of aircraft.trail.slice(-20)) {
    const at = Date.parse(point.recordedAt);
    if (!Number.isFinite(at)) continue;
    candidates.push({
      at,
      lat: point.lat,
      lon: point.lon,
      altitudeFt: finite(point.altitude) ? point.altitude : null,
    });
  }

  if (finite(aircraft.lat) && finite(aircraft.lon)) {
    const at = positionObservedAt(aircraft);
    if (at !== null) {
      candidates.push({
        at,
        lat: aircraft.lat,
        lon: aircraft.lon,
        altitudeFt: currentAltitude(aircraft),
      });
    }
  }

  let best: TruthCandidate | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const delta = Math.abs(candidate.at - targetAt);
    if (delta <= TRUTH_TOLERANCE_MS && delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function aggregateSample(
  aggregate: Aggregate,
  pending: PendingOutcomeSample,
  truth: TruthCandidate,
): void {
  const positionErrorNm = haversineDistanceKm(
    pending.predicted.lat,
    pending.predicted.lon,
    truth.lat,
    truth.lon,
  ) / KM_PER_NM;
  const uncertaintyNm = Math.max(0.01, pending.predicted.uncertaintyNm);

  aggregate.samples += 1;
  aggregate.positionErrorNmSum += positionErrorNm;
  aggregate.uncertaintyNmSum += uncertaintyNm;
  aggregate.errorToUncertaintyRatioSum += positionErrorNm / uncertaintyNm;
  if (positionErrorNm <= uncertaintyNm) aggregate.insideUncertainty += 1;
  if (finite(pending.predicted.altitudeFt) && finite(truth.altitudeFt)) {
    aggregate.altitudeSamples += 1;
    aggregate.altitudeErrorFtSum += Math.abs(pending.predicted.altitudeFt - truth.altitudeFt);
  }
}

export class OperationalTwinOutcomeValidator {
  private readonly pending = new Map<string, PendingOutcomeSample>();
  private readonly lastCaptureAt = new Map<string, number>();
  private buckets: OutcomeBucket[] = [];
  private firstObservedAt: number | null = null;
  private duplicateCaptureSkips = 0;
  private capacityEvictions = 0;

  capture(situation: OperationalTwinSituation, now = Date.parse(situation.generatedAt)): void {
    if (!Number.isFinite(now)) return;
    const previous = this.lastCaptureAt.get(situation.aircraft.icaoHex) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < MIN_CAPTURE_INTERVAL_MS) {
      this.duplicateCaptureSkips += 1;
      return;
    }

    let created = 0;
    for (const horizonMinutes of OPERATIONAL_TWIN_OUTCOME_HORIZONS_MINUTES) {
      const point = operationalTwinOutcomePointAt(situation.corridor.points, horizonMinutes);
      if (!point) continue;
      const targetAt = now + horizonMinutes * 60_000;
      const id = `${situation.aircraft.icaoHex}:${now}:${horizonMinutes}`;
      this.pending.set(id, {
        id,
        icaoHex: situation.aircraft.icaoHex,
        capturedAt: now,
        targetAt,
        expiresAt: targetAt + TRUTH_GRACE_MS,
        horizonMinutes,
        mode: situation.corridor.mode,
        stateSource: situation.aircraft.stateSource,
        predicted: {
          lat: point.lat,
          lon: point.lon,
          altitudeFt: point.altitudeFt,
          uncertaintyNm: point.uncertaintyNm,
        },
      });
      this.bucketFor(now).created += 1;
      created += 1;
    }

    if (created > 0) {
      if (this.firstObservedAt === null) this.firstObservedAt = now;
      this.lastCaptureAt.set(situation.aircraft.icaoHex, now);
      this.enforceCapacity();
      this.cleanup(now);
    }
  }

  observeTruth(local: ReadonlyMap<string, Aircraft>, now = Date.now()): void {
    if (!Number.isFinite(now)) return;
    for (const [id, pending] of this.pending) {
      if (now < pending.targetAt) continue;
      const aircraft = local.get(pending.icaoHex);
      const truth = aircraft ? truthCandidate(aircraft, pending.targetAt) : null;
      if (truth) {
        const bucket = this.bucketFor(pending.capturedAt);
        bucket.completed += 1;
        aggregateSample(bucket.byHorizon[pending.horizonMinutes]!, pending, truth);
        aggregateSample(bucket.byMode[pending.mode], pending, truth);
        aggregateSample(bucket.byStateSource[pending.stateSource], pending, truth);
        this.pending.delete(id);
        continue;
      }
      if (now > pending.expiresAt) {
        this.bucketFor(pending.capturedAt).expiredWithoutTruth += 1;
        this.pending.delete(id);
      }
    }
    this.cleanup(now);
  }

  report(now = new Date()): OperationalTwinOutcomeReport {
    const nowMs = now.getTime();
    const cutoff = nowMs - WINDOW_MS;
    const buckets = this.buckets.filter((bucket) => bucket.startMs + BUCKET_MS > cutoff);
    const overall = emptyAggregate();
    const byHorizon = new Map<number, Aggregate>(
      OPERATIONAL_TWIN_OUTCOME_HORIZONS_MINUTES.map((horizon) => [horizon, emptyAggregate()]),
    );
    const byMode = new Map<OperationalTwinCorridorMode, Aggregate>([
      ["ROUTE_AWARE", emptyAggregate()],
      ["KINEMATIC", emptyAggregate()],
    ]);
    const byStateSource = new Map<OperationalTwinSituation["aircraft"]["stateSource"], Aggregate>([
      ["CANONICAL", emptyAggregate()],
      ["TRACK_FUSION", emptyAggregate()],
    ]);

    let created = 0;
    let completed = 0;
    let expiredWithoutTruth = 0;
    for (const bucket of buckets) {
      created += bucket.created;
      completed += bucket.completed;
      expiredWithoutTruth += bucket.expiredWithoutTruth;
      for (const [horizon, aggregate] of Object.entries(bucket.byHorizon)) {
        const target = byHorizon.get(Number(horizon));
        if (target) addAggregate(target, aggregate);
        addAggregate(overall, aggregate);
      }
      for (const [mode, aggregate] of Object.entries(bucket.byMode) as Array<[OperationalTwinCorridorMode, Aggregate]>) {
        addAggregate(byMode.get(mode)!, aggregate);
      }
      for (const [source, aggregate] of Object.entries(bucket.byStateSource) as Array<[OperationalTwinSituation["aircraft"]["stateSource"], Aggregate]>) {
        addAggregate(byStateSource.get(source)!, aggregate);
      }
    }

    const first = Math.max(cutoff, this.firstObservedAt ?? nowMs);
    const spanMinutes = Math.max(0, Math.min(OPERATIONAL_TWIN_OUTCOME_WINDOW_MINUTES, (nowMs - first) / 60_000));
    const overallSlice = aggregateToSlice(overall);
    const horizonSlices = Object.fromEntries(
      [...byHorizon.entries()].map(([horizon, aggregate]) => [String(horizon), aggregateToSlice(aggregate)]),
    );
    const modeSlices = Object.fromEntries(
      [...byMode.entries()].map(([mode, aggregate]) => [mode, aggregateToSlice(aggregate)]),
    ) as Record<OperationalTwinCorridorMode, OperationalTwinOutcomeSlice>;
    const stateSourceSlices = Object.fromEntries(
      [...byStateSource.entries()].map(([source, aggregate]) => [source, aggregateToSlice(aggregate)]),
    ) as Record<OperationalTwinSituation["aircraft"]["stateSource"], OperationalTwinOutcomeSlice>;

    const evaluatedOrExpired = completed + expiredWithoutTruth;
    const expiredTruthRate = evaluatedOrExpired ? expiredWithoutTruth / evaluatedOrExpired : null;
    const evaluated = evaluateOperationalTwinOutcomeDecision({
      spanMinutes,
      overall: overallSlice,
      horizons: [...byHorizon.values()].map(aggregateToSlice),
      expiredTruthRate,
    });

    return {
      version: OPERATIONAL_TWIN_OUTCOME_VERSION,
      generatedAt: now.toISOString(),
      decision: evaluated.decision,
      reasons: evaluated.reasons,
      complete: evaluated.complete,
      thresholds: OPERATIONAL_TWIN_OUTCOME_THRESHOLDS,
      truthSource: "LOCAL_RECEIVER",
      requestDrivenCapture: true,
      horizonsMinutes: OPERATIONAL_TWIN_OUTCOME_HORIZONS_MINUTES,
      window: {
        from: new Date(first).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        bucketMinutes: OPERATIONAL_TWIN_OUTCOME_BUCKET_MINUTES,
        buckets: buckets.length,
        processLocal: true,
      },
      pending: this.pending.size,
      created,
      completed,
      expiredWithoutTruth,
      expiredTruthRate: expiredTruthRate === null ? null : Number(expiredTruthRate.toFixed(4)),
      duplicateCaptureSkips: this.duplicateCaptureSkips,
      capacityEvictions: this.capacityEvictions,
      overall: overallSlice,
      horizons: horizonSlices,
      modes: modeSlices,
      stateSources: stateSourceSlices,
    };
  }


  exportCalibrationBuckets(now = Date.now()): OperationalTwinOutcomeCalibrationBucket[] {
    this.cleanup(now);
    const cutoff = now - WINDOW_MS;
    return this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .map((bucket) => ({ startMs: bucket.startMs, payloadJson: JSON.stringify(bucket) }));
  }

  hydrateCalibrationBuckets(rows: readonly OperationalTwinOutcomeCalibrationBucket[], now = Date.now()): number {
    const cutoff = now - WINDOW_MS;
    const hydrated = new Map<number, OutcomeBucket>();
    let hydratedFromPersistence = 0;
    for (const row of rows) {
      if (!Number.isFinite(row.startMs) || row.startMs + BUCKET_MS <= cutoff || row.startMs > now + BUCKET_MS) continue;
      const bucket = persistedOutcomeBucket(row.payloadJson, row.startMs);
      if (bucket) {
        hydrated.set(bucket.startMs, bucket);
        hydratedFromPersistence += 1;
      }
    }
    for (const bucket of this.buckets) {
      if (bucket.startMs + BUCKET_MS > cutoff) hydrated.set(bucket.startMs, bucket);
    }
    this.buckets = [...hydrated.values()]
      .sort((left, right) => left.startMs - right.startMs)
      .slice(-MAX_BUCKETS);
    const earliest = this.buckets[0]?.startMs ?? null;
    if (earliest !== null) this.firstObservedAt = Math.min(this.firstObservedAt ?? earliest, earliest);
    return hydratedFromPersistence;
  }

  reset(): void {
    this.pending.clear();
    this.lastCaptureAt.clear();
    this.buckets = [];
    this.firstObservedAt = null;
    this.duplicateCaptureSkips = 0;
    this.capacityEvictions = 0;
  }

  private bucketFor(timestamp: number): OutcomeBucket {
    const startMs = Math.floor(timestamp / BUCKET_MS) * BUCKET_MS;
    let bucket = this.buckets.find((candidate) => candidate.startMs === startMs);
    if (!bucket) {
      bucket = {
        startMs,
        created: 0,
        completed: 0,
        expiredWithoutTruth: 0,
        byHorizon: Object.fromEntries(
          OPERATIONAL_TWIN_OUTCOME_HORIZONS_MINUTES.map((horizon) => [horizon, emptyAggregate()]),
        ),
        byMode: {
          ROUTE_AWARE: emptyAggregate(),
          KINEMATIC: emptyAggregate(),
        },
        byStateSource: {
          CANONICAL: emptyAggregate(),
          TRACK_FUSION: emptyAggregate(),
        },
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
    const cutoff = now - WINDOW_MS - 35 * 60_000;
    this.buckets = this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .slice(-MAX_BUCKETS);
    for (const [hex, capturedAt] of this.lastCaptureAt) {
      if (capturedAt < now - WINDOW_MS) this.lastCaptureAt.delete(hex);
    }
  }
}
