import type { Aircraft } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import type { OperationalTwinSituation } from "./types";
import type { OperationalTwinTrajectoryPhase } from "./trajectory-quality-v2";
import type {
  OperationalTwinPerformanceClass,
  OperationalTwinTrajectoryQualityV3Profile,
} from "./trajectory-quality-v3";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_VERSION =
  "operational-digital-twin-trajectory-quality-outcome-v2" as const;

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_HORIZONS = [5, 15, 30] as const;
export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_WINDOW_MINUTES = 24 * 60;
export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_BUCKET_MINUTES = 5;

const MIN_CAPTURE_INTERVAL_MS = 55_000;
const TRUTH_TOLERANCE_MS = 20_000;
const TRUTH_GRACE_MS = 30_000;
const MAX_PENDING = 5_000;
const TIE_TOLERANCE_FT = 100;
const BUCKET_MS = OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_BUCKET_MINUTES * 60_000;
const WINDOW_MS = OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_WINDOW_MINUTES * 60_000;
const MAX_BUCKETS = Math.ceil(WINDOW_MS / BUCKET_MS) + 2;

const TRAJECTORY_PHASES: readonly OperationalTwinTrajectoryPhase[] = [
  "CLIMB",
  "CRUISE",
  "DESCENT",
  "LEVEL",
  "UNKNOWN",
];

const PERFORMANCE_CLASSES: readonly OperationalTwinPerformanceClass[] = [
  "JET",
  "TURBOPROP",
  "PISTON",
  "ROTORCRAFT",
  "UNKNOWN",
];

const V3_PROFILES: readonly OperationalTwinTrajectoryQualityV3Profile[] = [
  "SELECTED_ALTITUDE_CAPTURE",
  "PERFORMANCE_TAPERED",
  "ALTITUDE_HOLD",
  "V2_FALLBACK",
  "UNAVAILABLE",
];

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS = {
  version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_VERSION,
  minimumSpanMinutes: 120,
  minimumPairedSamples: 60,
  minimumPairedSamplesPerHorizon: 12,
  minimumTruthCoverage: 0.60,
  tieToleranceFt: TIE_TOLERANCE_FT,
} as const;

export type OperationalTwinTrajectoryQualityOutcomeV2Decision = "PASS" | "WAIT" | "FAIL";
export type OperationalTwinTrajectoryQualityOutcomeV2Reason =
  | "process_window_insufficient"
  | "paired_samples_insufficient"
  | "horizon_samples_insufficient"
  | "truth_coverage_low";

type Horizon = typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_HORIZONS[number];

interface PendingTrajectoryQualityV2Sample {
  id: string;
  icaoHex: string;
  capturedAt: number;
  targetAt: number;
  expiresAt: number;
  horizonMinutes: Horizon;
  phase: OperationalTwinTrajectoryPhase;
  performanceClass: OperationalTwinPerformanceClass;
  v3Profile: OperationalTwinTrajectoryQualityV3Profile;
  canonicalAltitudeFt: number;
  v2AltitudeFt: number;
  v3AltitudeFt: number;
}

interface Aggregate {
  pairedSamples: number;
  canonicalAbsoluteErrorFtSum: number;
  v2AbsoluteErrorFtSum: number;
  v3AbsoluteErrorFtSum: number;
  v2WinsCanonical: number;
  canonicalWinsV2: number;
  v2CanonicalTies: number;
  v3WinsCanonical: number;
  canonicalWinsV3: number;
  v3CanonicalTies: number;
  v3WinsV2: number;
  v2WinsV3: number;
  v3V2Ties: number;
}

interface OutcomeBucket {
  startMs: number;
  captured: number;
  expiredWithoutTruth: number;
  byHorizon: Record<Horizon, Aggregate>;
  byPhase: Record<OperationalTwinTrajectoryPhase, Aggregate>;
  byPerformanceClass: Record<OperationalTwinPerformanceClass, Aggregate>;
  byV3Profile: Record<OperationalTwinTrajectoryQualityV3Profile, Aggregate>;
}

export interface OperationalTwinTrajectoryQualityOutcomeV2CalibrationBucket {
  startMs: number;
  payloadJson: string;
}

export interface OperationalTwinTrajectoryQualityOutcomeV2Slice {
  pairedSamples: number;
  canonicalMeanAbsoluteErrorFt: number | null;
  v2MeanAbsoluteErrorFt: number | null;
  v3MeanAbsoluteErrorFt: number | null;
  v2RelativeMaeImprovementVsCanonical: number | null;
  v3RelativeMaeImprovementVsCanonical: number | null;
  v3RelativeMaeImprovementVsV2: number | null;
  v2WinsCanonical: number;
  canonicalWinsV2: number;
  v2CanonicalTies: number;
  v2WinRateVsCanonical: number | null;
  v3WinsCanonical: number;
  canonicalWinsV3: number;
  v3CanonicalTies: number;
  v3WinRateVsCanonical: number | null;
  v3WinsV2: number;
  v2WinsV3: number;
  v3V2Ties: number;
  v3WinRateVsV2: number | null;
  bestMeanAbsoluteErrorModel: "CANONICAL" | "TRAJECTORY_QUALITY_V2" | "TRAJECTORY_QUALITY_V3" | "TIE" | null;
}

export interface OperationalTwinTrajectoryQualityOutcomeV2Report {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_VERSION;
  generatedAt: string;
  decision: OperationalTwinTrajectoryQualityOutcomeV2Decision;
  reasons: OperationalTwinTrajectoryQualityOutcomeV2Reason[];
  complete: boolean;
  thresholds: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS;
  truthSource: "LOCAL_RECEIVER";
  comparisonModels: readonly ["CANONICAL", "TRAJECTORY_QUALITY_V2", "TRAJECTORY_QUALITY_V3"];
  requestDrivenCapture: true;
  refreshDrivenTruthSampling: true;
  shadowOnly: true;
  changesPromotionPolicy: false;
  horizonsMinutes: readonly [5, 15, 30];
  window: {
    from: string;
    to: string;
    spanMinutes: number;
    bucketMinutes: number;
    buckets: number;
    restartStableAggregates: true;
  };
  pending: number;
  created: number;
  completed: number;
  expiredWithoutTruth: number;
  truthCoverage: number | null;
  duplicateCaptureSkips: number;
  v3UnavailableCaptureSkips: number;
  capacityEvictions: number;
  overall: OperationalTwinTrajectoryQualityOutcomeV2Slice;
  horizons: Record<string, OperationalTwinTrajectoryQualityOutcomeV2Slice>;
  phases: Record<OperationalTwinTrajectoryPhase, OperationalTwinTrajectoryQualityOutcomeV2Slice>;
  performanceClasses: Record<OperationalTwinPerformanceClass, OperationalTwinTrajectoryQualityOutcomeV2Slice>;
  v3Profiles: Record<OperationalTwinTrajectoryQualityV3Profile, OperationalTwinTrajectoryQualityOutcomeV2Slice>;
  limitations: Array<
    | "OUTCOME_MEASUREMENT_ONLY"
    | "NO_AUTO_GRADUATION"
    | "NO_PROMOTION_CHANGE"
    | "LOCAL_RECEIVER_TRUTH_ONLY"
    | "RESTART_STABLE_AGGREGATES"
    | "TRIPLE_PAIRED_SAMPLES_ONLY"
  >;
}

export interface OperationalTwinTrajectoryQualityOutcomeV2DecisionInput {
  spanMinutes: number;
  overall: OperationalTwinTrajectoryQualityOutcomeV2Slice;
  horizons: readonly OperationalTwinTrajectoryQualityOutcomeV2Slice[];
  truthCoverage: number | null;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function currentAltitudeFt(aircraft: Aircraft): number | null {
  if (finite(aircraft.baroAltitude)) return aircraft.baroAltitude;
  if (finite(aircraft.altitude)) return aircraft.altitude;
  if (finite(aircraft.geomAltitude)) return aircraft.geomAltitude;
  return null;
}

function truthAltitudeAt(aircraft: Aircraft, targetAt: number): number | null {
  let bestAltitude: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const point of aircraft.trail.slice(-20)) {
    const at = Date.parse(point.recordedAt);
    if (!Number.isFinite(at) || !finite(point.altitude)) continue;
    const delta = Math.abs(at - targetAt);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestAltitude = point.altitude;
    }
  }

  const observedAt = positionObservedAt(aircraft);
  const currentAltitude = currentAltitudeFt(aircraft);
  if (observedAt !== null && currentAltitude !== null) {
    const delta = Math.abs(observedAt - targetAt);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestAltitude = currentAltitude;
    }
  }

  return bestDelta <= TRUTH_TOLERANCE_MS ? bestAltitude : null;
}

function emptyAggregate(): Aggregate {
  return {
    pairedSamples: 0,
    canonicalAbsoluteErrorFtSum: 0,
    v2AbsoluteErrorFtSum: 0,
    v3AbsoluteErrorFtSum: 0,
    v2WinsCanonical: 0,
    canonicalWinsV2: 0,
    v2CanonicalTies: 0,
    v3WinsCanonical: 0,
    canonicalWinsV3: 0,
    v3CanonicalTies: 0,
    v3WinsV2: 0,
    v2WinsV3: 0,
    v3V2Ties: 0,
  };
}

function horizonRecord(): Record<Horizon, Aggregate> {
  return { 5: emptyAggregate(), 15: emptyAggregate(), 30: emptyAggregate() };
}

function phaseRecord(): Record<OperationalTwinTrajectoryPhase, Aggregate> {
  return Object.fromEntries(TRAJECTORY_PHASES.map((phase) => [phase, emptyAggregate()]))
    as Record<OperationalTwinTrajectoryPhase, Aggregate>;
}

function performanceRecord(): Record<OperationalTwinPerformanceClass, Aggregate> {
  return Object.fromEntries(PERFORMANCE_CLASSES.map((value) => [value, emptyAggregate()]))
    as Record<OperationalTwinPerformanceClass, Aggregate>;
}

function profileRecord(): Record<OperationalTwinTrajectoryQualityV3Profile, Aggregate> {
  return Object.fromEntries(V3_PROFILES.map((value) => [value, emptyAggregate()]))
    as Record<OperationalTwinTrajectoryQualityV3Profile, Aggregate>;
}

function addAggregate(target: Aggregate, source: Aggregate): void {
  for (const key of Object.keys(target) as Array<keyof Aggregate>) target[key] += source[key];
}

function compareErrors(
  leftError: number,
  rightError: number,
): "LEFT" | "RIGHT" | "TIE" {
  const delta = rightError - leftError;
  if (Math.abs(delta) <= TIE_TOLERANCE_FT) return "TIE";
  return delta > 0 ? "LEFT" : "RIGHT";
}

function bestModel(
  canonicalMae: number,
  v2Mae: number,
  v3Mae: number,
): OperationalTwinTrajectoryQualityOutcomeV2Slice["bestMeanAbsoluteErrorModel"] {
  const minimum = Math.min(canonicalMae, v2Mae, v3Mae);
  const winners = [
    ["CANONICAL", canonicalMae],
    ["TRAJECTORY_QUALITY_V2", v2Mae],
    ["TRAJECTORY_QUALITY_V3", v3Mae],
  ].filter(([, value]) => Math.abs((value as number) - minimum) <= TIE_TOLERANCE_FT);
  return winners.length === 1
    ? winners[0]![0] as "CANONICAL" | "TRAJECTORY_QUALITY_V2" | "TRAJECTORY_QUALITY_V3"
    : "TIE";
}

function ratioImprovement(baseline: number, candidate: number): number | null {
  return baseline > 0 ? Number(((baseline - candidate) / baseline).toFixed(4)) : null;
}

function winRate(wins: number, losses: number): number | null {
  const decisive = wins + losses;
  return decisive ? Number((wins / decisive).toFixed(4)) : null;
}

function sliceFromAggregate(value: Aggregate): OperationalTwinTrajectoryQualityOutcomeV2Slice {
  if (!value.pairedSamples) {
    return {
      pairedSamples: 0,
      canonicalMeanAbsoluteErrorFt: null,
      v2MeanAbsoluteErrorFt: null,
      v3MeanAbsoluteErrorFt: null,
      v2RelativeMaeImprovementVsCanonical: null,
      v3RelativeMaeImprovementVsCanonical: null,
      v3RelativeMaeImprovementVsV2: null,
      v2WinsCanonical: 0,
      canonicalWinsV2: 0,
      v2CanonicalTies: 0,
      v2WinRateVsCanonical: null,
      v3WinsCanonical: 0,
      canonicalWinsV3: 0,
      v3CanonicalTies: 0,
      v3WinRateVsCanonical: null,
      v3WinsV2: 0,
      v2WinsV3: 0,
      v3V2Ties: 0,
      v3WinRateVsV2: null,
      bestMeanAbsoluteErrorModel: null,
    };
  }

  const canonicalMae = value.canonicalAbsoluteErrorFtSum / value.pairedSamples;
  const v2Mae = value.v2AbsoluteErrorFtSum / value.pairedSamples;
  const v3Mae = value.v3AbsoluteErrorFtSum / value.pairedSamples;

  return {
    pairedSamples: value.pairedSamples,
    canonicalMeanAbsoluteErrorFt: Math.round(canonicalMae),
    v2MeanAbsoluteErrorFt: Math.round(v2Mae),
    v3MeanAbsoluteErrorFt: Math.round(v3Mae),
    v2RelativeMaeImprovementVsCanonical: ratioImprovement(canonicalMae, v2Mae),
    v3RelativeMaeImprovementVsCanonical: ratioImprovement(canonicalMae, v3Mae),
    v3RelativeMaeImprovementVsV2: ratioImprovement(v2Mae, v3Mae),
    v2WinsCanonical: value.v2WinsCanonical,
    canonicalWinsV2: value.canonicalWinsV2,
    v2CanonicalTies: value.v2CanonicalTies,
    v2WinRateVsCanonical: winRate(value.v2WinsCanonical, value.canonicalWinsV2),
    v3WinsCanonical: value.v3WinsCanonical,
    canonicalWinsV3: value.canonicalWinsV3,
    v3CanonicalTies: value.v3CanonicalTies,
    v3WinRateVsCanonical: winRate(value.v3WinsCanonical, value.canonicalWinsV3),
    v3WinsV2: value.v3WinsV2,
    v2WinsV3: value.v2WinsV3,
    v3V2Ties: value.v3V2Ties,
    v3WinRateVsV2: winRate(value.v3WinsV2, value.v2WinsV3),
    bestMeanAbsoluteErrorModel: bestModel(canonicalMae, v2Mae, v3Mae),
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

function parseRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
): Record<K, Aggregate> | null {
  if (!value || typeof value !== "object") return null;
  const result = {} as Record<K, Aggregate>;
  for (const key of keys) {
    const aggregate = persistedAggregate((value as Record<string, unknown>)[key]);
    if (!aggregate) return null;
    result[key] = aggregate;
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
  if (!nonNegativeFinite(item.captured) || !nonNegativeFinite(item.expiredWithoutTruth)) return null;

  const byHorizon = parseRecord(item.byHorizon, OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_HORIZONS.map(String));
  if (!byHorizon) return null;
  const normalizedHorizon = {
    5: byHorizon["5"],
    15: byHorizon["15"],
    30: byHorizon["30"],
  } satisfies Record<Horizon, Aggregate>;
  const byPhase = parseRecord(item.byPhase, TRAJECTORY_PHASES);
  const byPerformanceClass = parseRecord(item.byPerformanceClass, PERFORMANCE_CLASSES);
  const byV3Profile = parseRecord(item.byV3Profile, V3_PROFILES);
  if (!byPhase || !byPerformanceClass || !byV3Profile) return null;

  return {
    startMs: expectedStartMs,
    captured: item.captured,
    expiredWithoutTruth: item.expiredWithoutTruth,
    byHorizon: normalizedHorizon,
    byPhase,
    byPerformanceClass,
    byV3Profile,
  };
}

export function evaluateOperationalTwinTrajectoryQualityOutcomeV2(
  input: OperationalTwinTrajectoryQualityOutcomeV2DecisionInput,
): {
  decision: OperationalTwinTrajectoryQualityOutcomeV2Decision;
  reasons: OperationalTwinTrajectoryQualityOutcomeV2Reason[];
  complete: boolean;
} {
  const readinessReasons: OperationalTwinTrajectoryQualityOutcomeV2Reason[] = [];
  if (input.spanMinutes < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS.minimumSpanMinutes) {
    readinessReasons.push("process_window_insufficient");
  }
  if (input.overall.pairedSamples < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS.minimumPairedSamples) {
    readinessReasons.push("paired_samples_insufficient");
  }
  if (input.horizons.some((slice) =>
    slice.pairedSamples < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS.minimumPairedSamplesPerHorizon
  )) {
    readinessReasons.push("horizon_samples_insufficient");
  }

  if (readinessReasons.length) {
    return { decision: "WAIT", reasons: readinessReasons, complete: false };
  }

  if (
    input.truthCoverage === null
    || input.truthCoverage < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS.minimumTruthCoverage
  ) {
    return { decision: "FAIL", reasons: ["truth_coverage_low"], complete: true };
  }

  return { decision: "PASS", reasons: [], complete: true };
}

interface CompletedSample {
  canonicalAbsoluteErrorFt: number;
  v2AbsoluteErrorFt: number;
  v3AbsoluteErrorFt: number;
}

function addCompletedSample(target: Aggregate, sample: CompletedSample): void {
  target.pairedSamples += 1;
  target.canonicalAbsoluteErrorFtSum += sample.canonicalAbsoluteErrorFt;
  target.v2AbsoluteErrorFtSum += sample.v2AbsoluteErrorFt;
  target.v3AbsoluteErrorFtSum += sample.v3AbsoluteErrorFt;

  const v2Canonical = compareErrors(sample.v2AbsoluteErrorFt, sample.canonicalAbsoluteErrorFt);
  if (v2Canonical === "LEFT") target.v2WinsCanonical += 1;
  else if (v2Canonical === "RIGHT") target.canonicalWinsV2 += 1;
  else target.v2CanonicalTies += 1;

  const v3Canonical = compareErrors(sample.v3AbsoluteErrorFt, sample.canonicalAbsoluteErrorFt);
  if (v3Canonical === "LEFT") target.v3WinsCanonical += 1;
  else if (v3Canonical === "RIGHT") target.canonicalWinsV3 += 1;
  else target.v3CanonicalTies += 1;

  const v3V2 = compareErrors(sample.v3AbsoluteErrorFt, sample.v2AbsoluteErrorFt);
  if (v3V2 === "LEFT") target.v3WinsV2 += 1;
  else if (v3V2 === "RIGHT") target.v2WinsV3 += 1;
  else target.v3V2Ties += 1;
}

function recordFromKeys<K extends string>(
  keys: readonly K[],
  source: Record<K, Aggregate>,
): Record<K, OperationalTwinTrajectoryQualityOutcomeV2Slice> {
  return Object.fromEntries(keys.map((key) => [key, sliceFromAggregate(source[key])]))
    as Record<K, OperationalTwinTrajectoryQualityOutcomeV2Slice>;
}

export class OperationalTwinTrajectoryQualityOutcomeV2Validator {
  private readonly pending = new Map<string, PendingTrajectoryQualityV2Sample>();
  private readonly lastCaptureAt = new Map<string, number>();
  private buckets: OutcomeBucket[] = [];
  private duplicateCaptureSkips = 0;
  private v3UnavailableCaptureSkips = 0;
  private capacityEvictions = 0;

  capture(situation: OperationalTwinSituation, now = Date.parse(situation.generatedAt)): void {
    if (!Number.isFinite(now)) return;
    const v2 = situation.trajectoryQualityV2;
    const v3 = situation.trajectoryQualityV3;
    if (!v2 || v2.status !== "AVAILABLE" || !v3 || v3.status !== "AVAILABLE") {
      this.v3UnavailableCaptureSkips += 1;
      return;
    }

    const previous = this.lastCaptureAt.get(situation.aircraft.icaoHex) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < MIN_CAPTURE_INTERVAL_MS) {
      this.duplicateCaptureSkips += 1;
      return;
    }

    let created = 0;
    for (const checkpoint of v3.checkpoints) {
      if (
        !finite(checkpoint.canonicalAltitudeFt)
        || !finite(checkpoint.v2AltitudeFt)
        || !finite(checkpoint.v3AltitudeFt)
      ) continue;

      const horizonMinutes = checkpoint.offsetMinutes;
      const targetAt = now + horizonMinutes * 60_000;
      const id = `${situation.aircraft.icaoHex}:${now}:${horizonMinutes}`;
      this.pending.set(id, {
        id,
        icaoHex: situation.aircraft.icaoHex,
        capturedAt: now,
        targetAt,
        expiresAt: targetAt + TRUTH_GRACE_MS,
        horizonMinutes,
        phase: v3.phase,
        performanceClass: v3.performance.performanceClass,
        v3Profile: v3.verticalProfile,
        canonicalAltitudeFt: checkpoint.canonicalAltitudeFt,
        v2AltitudeFt: checkpoint.v2AltitudeFt,
        v3AltitudeFt: checkpoint.v3AltitudeFt,
      });
      created += 1;
    }

    if (created > 0) {
      this.lastCaptureAt.set(situation.aircraft.icaoHex, now);
      this.bucketFor(now).captured += created;
      this.enforceCapacity();
      this.cleanup(now);
    }
  }

  observeTruth(local: ReadonlyMap<string, Aircraft>, now = Date.now()): void {
    if (!Number.isFinite(now)) return;
    for (const [id, pending] of this.pending) {
      if (now < pending.targetAt) continue;
      const aircraft = local.get(pending.icaoHex);
      const truthAltitude = aircraft ? truthAltitudeAt(aircraft, pending.targetAt) : null;

      if (truthAltitude !== null) {
        const completed: CompletedSample = {
          canonicalAbsoluteErrorFt: Math.abs(pending.canonicalAltitudeFt - truthAltitude),
          v2AbsoluteErrorFt: Math.abs(pending.v2AltitudeFt - truthAltitude),
          v3AbsoluteErrorFt: Math.abs(pending.v3AltitudeFt - truthAltitude),
        };
        const bucket = this.bucketFor(pending.capturedAt);
        addCompletedSample(bucket.byHorizon[pending.horizonMinutes], completed);
        addCompletedSample(bucket.byPhase[pending.phase], completed);
        addCompletedSample(bucket.byPerformanceClass[pending.performanceClass], completed);
        addCompletedSample(bucket.byV3Profile[pending.v3Profile], completed);
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

  report(now = new Date()): OperationalTwinTrajectoryQualityOutcomeV2Report {
    const nowMs = now.getTime();
    this.cleanup(nowMs);
    const cutoff = nowMs - WINDOW_MS;
    const buckets = this.buckets.filter((bucket) => bucket.startMs + BUCKET_MS > cutoff);

    const overall = emptyAggregate();
    const byHorizon = horizonRecord();
    const byPhase = phaseRecord();
    const byPerformanceClass = performanceRecord();
    const byV3Profile = profileRecord();
    let created = 0;
    let expiredWithoutTruth = 0;

    for (const bucket of buckets) {
      created += bucket.captured;
      expiredWithoutTruth += bucket.expiredWithoutTruth;
      for (const horizon of OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_HORIZONS) {
        addAggregate(byHorizon[horizon], bucket.byHorizon[horizon]);
        addAggregate(overall, bucket.byHorizon[horizon]);
      }
      for (const phase of TRAJECTORY_PHASES) addAggregate(byPhase[phase], bucket.byPhase[phase]);
      for (const performanceClass of PERFORMANCE_CLASSES) {
        addAggregate(byPerformanceClass[performanceClass], bucket.byPerformanceClass[performanceClass]);
      }
      for (const profile of V3_PROFILES) addAggregate(byV3Profile[profile], bucket.byV3Profile[profile]);
    }

    const completed = overall.pairedSamples;
    const evaluatedOrExpired = completed + expiredWithoutTruth;
    const truthCoverage = evaluatedOrExpired ? completed / evaluatedOrExpired : null;
    const horizonSlices = Object.fromEntries(
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_HORIZONS.map((horizon) => [
        String(horizon),
        sliceFromAggregate(byHorizon[horizon]),
      ]),
    ) as Record<string, OperationalTwinTrajectoryQualityOutcomeV2Slice>;
    const phaseSlices = recordFromKeys(TRAJECTORY_PHASES, byPhase);
    const performanceSlices = recordFromKeys(PERFORMANCE_CLASSES, byPerformanceClass);
    const profileSlices = recordFromKeys(V3_PROFILES, byV3Profile);
    const overallSlice = sliceFromAggregate(overall);

    const firstBucket = buckets[0]?.startMs ?? nowMs;
    const first = Math.max(cutoff, firstBucket);
    const spanMinutes = Math.max(0, Math.min(
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_WINDOW_MINUTES,
      (nowMs - first) / 60_000,
    ));

    const evaluated = evaluateOperationalTwinTrajectoryQualityOutcomeV2({
      spanMinutes,
      overall: overallSlice,
      horizons: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_HORIZONS.map(
        (horizon) => horizonSlices[String(horizon)]!,
      ),
      truthCoverage,
    });

    return {
      version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_VERSION,
      generatedAt: now.toISOString(),
      decision: evaluated.decision,
      reasons: evaluated.reasons,
      complete: evaluated.complete,
      thresholds: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_THRESHOLDS,
      truthSource: "LOCAL_RECEIVER",
      comparisonModels: ["CANONICAL", "TRAJECTORY_QUALITY_V2", "TRAJECTORY_QUALITY_V3"],
      requestDrivenCapture: true,
      refreshDrivenTruthSampling: true,
      shadowOnly: true,
      changesPromotionPolicy: false,
      horizonsMinutes: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_HORIZONS,
      window: {
        from: new Date(first).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        bucketMinutes: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_V2_BUCKET_MINUTES,
        buckets: buckets.length,
        restartStableAggregates: true,
      },
      pending: [...this.pending.values()].filter((sample) => sample.capturedAt >= cutoff).length,
      created,
      completed,
      expiredWithoutTruth,
      truthCoverage: truthCoverage === null ? null : Number(truthCoverage.toFixed(4)),
      duplicateCaptureSkips: this.duplicateCaptureSkips,
      v3UnavailableCaptureSkips: this.v3UnavailableCaptureSkips,
      capacityEvictions: this.capacityEvictions,
      overall: overallSlice,
      horizons: horizonSlices,
      phases: phaseSlices,
      performanceClasses: performanceSlices,
      v3Profiles: profileSlices,
      limitations: [
        "OUTCOME_MEASUREMENT_ONLY",
        "NO_AUTO_GRADUATION",
        "NO_PROMOTION_CHANGE",
        "LOCAL_RECEIVER_TRUTH_ONLY",
        "RESTART_STABLE_AGGREGATES",
        "TRIPLE_PAIRED_SAMPLES_ONLY",
      ],
    };
  }

  exportCalibrationBuckets(now = Date.now()): OperationalTwinTrajectoryQualityOutcomeV2CalibrationBucket[] {
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
    rows: readonly OperationalTwinTrajectoryQualityOutcomeV2CalibrationBucket[],
    now = Date.now(),
  ): number {
    const cutoff = now - WINDOW_MS;
    const hydrated = new Map<number, OutcomeBucket>();
    let count = 0;

    for (const row of rows) {
      if (!Number.isFinite(row.startMs) || row.startMs + BUCKET_MS <= cutoff || row.startMs > now + BUCKET_MS) continue;
      const bucket = persistedBucket(row.payloadJson, row.startMs);
      if (!bucket) continue;
      hydrated.set(bucket.startMs, bucket);
      count += 1;
    }

    for (const bucket of this.buckets) {
      if (bucket.startMs + BUCKET_MS <= cutoff) continue;
      if (!hydrated.has(bucket.startMs)) hydrated.set(bucket.startMs, bucket);
    }

    this.buckets = [...hydrated.values()].sort((a, b) => a.startMs - b.startMs).slice(-MAX_BUCKETS);
    return count;
  }

  private bucketFor(at: number): OutcomeBucket {
    const startMs = Math.floor(at / BUCKET_MS) * BUCKET_MS;
    let bucket = this.buckets.find((candidate) => candidate.startMs === startMs);
    if (!bucket) {
      bucket = {
        startMs,
        captured: 0,
        expiredWithoutTruth: 0,
        byHorizon: horizonRecord(),
        byPhase: phaseRecord(),
        byPerformanceClass: performanceRecord(),
        byV3Profile: profileRecord(),
      };
      this.buckets.push(bucket);
      this.buckets.sort((a, b) => a.startMs - b.startMs);
      if (this.buckets.length > MAX_BUCKETS) this.buckets.splice(0, this.buckets.length - MAX_BUCKETS);
    }
    return bucket;
  }

  private cleanup(now: number): void {
    const cutoff = now - WINDOW_MS;
    this.buckets = this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .slice(-MAX_BUCKETS);

    for (const [id, sample] of this.pending) {
      if (sample.capturedAt < cutoff || now > sample.expiresAt + WINDOW_MS) this.pending.delete(id);
    }
    for (const [icaoHex, capturedAt] of this.lastCaptureAt) {
      if (capturedAt < cutoff) this.lastCaptureAt.delete(icaoHex);
    }
  }

  private enforceCapacity(): void {
    while (this.pending.size > MAX_PENDING) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (!oldest) break;
      this.pending.delete(oldest);
      this.capacityEvictions += 1;
    }
  }
}
