import type { Aircraft, ReceiverPosition } from "@/lib/aircraft/types";
import { hasUsablePosition, mergeAircraftObservations, positionObservedAt } from "@/lib/aircraft/source-merge";
import { destination } from "@/lib/atc-context/geometry";
import { haversineDistanceKm } from "@/lib/geo";
import type { TrackFusionTrack, TrackFusionSourceClass } from "./types";

export const TRACK_FUSION_OUTCOME_VERSION = "track-fusion-outcome-validation-v1" as const;
export const TRACK_FUSION_OUTCOME_HORIZONS_SECONDS = [5, 15, 30] as const;
export const TRACK_FUSION_OUTCOME_WINDOW_MINUTES = 24 * 60;
export const TRACK_FUSION_OUTCOME_BUCKET_MINUTES = 5;

const KM_PER_NM = 1.852;
const BASELINE_INTERVAL_MS = 10_000;
const TRUTH_GRACE_MS = 5_000;
const MAX_PENDING = 6_000;
const PENDING_RETENTION_MS = 45_000;
const BUCKET_MS = TRACK_FUSION_OUTCOME_BUCKET_MINUTES * 60_000;
const WINDOW_MS = TRACK_FUSION_OUTCOME_WINDOW_MINUTES * 60_000;
const MAX_BUCKETS = Math.ceil(WINDOW_MS / BUCKET_MS) + 1;
const POSITION_TIE_NM = 0.05;

export const TRACK_FUSION_OUTCOME_THRESHOLDS = {
  version: TRACK_FUSION_OUTCOME_VERSION,
  minimumSpanMinutes: 120,
  minimumSamples: 600,
  minimumSamplesPerHorizon: 150,
  minimumHandoverSamples: 30,
  minimumNetWinMargin: 0.05,
  maximumMeanErrorRatio: 1,
  maximumHandoverMeanErrorRatio: 1.05,
  maximumExpiredTruthRate: 0.35,
} as const;

export type TrackFusionOutcomeDecision = "PASS" | "WAIT" | "FAIL";
export type TrackFusionOutcomeWinner = "FUSED" | "CANONICAL" | "TIE";
export type TrackFusionOutcomeScenario =
  | "STEADY_LOCAL"
  | "STEADY_NETWORK"
  | "HANDOVER_LOCAL_TO_NETWORK"
  | "HANDOVER_NETWORK_TO_LOCAL";

export type TrackFusionOutcomeReason =
  | "process_window_insufficient"
  | "samples_insufficient"
  | "horizon_samples_insufficient"
  | "handover_samples_insufficient"
  | "net_win_margin_low"
  | "mean_error_ratio_high"
  | "handover_mean_error_ratio_high"
  | "expired_truth_rate_high";

interface ProjectionState {
  position: { lat: number; lon: number };
  positionObservedAt: number;
  groundSpeedKt: number;
  trackDeg: number;
  altitudeFt: number | null;
  verticalRateFpm: number | null;
}

interface PendingOutcomeSample {
  id: string;
  icaoHex: string;
  createdAt: number;
  targetAt: number;
  expiresAt: number;
  horizonSeconds: number;
  scenario: TrackFusionOutcomeScenario;
  canonical: ProjectionState;
  fused: ProjectionState;
  fusedPositionSource: TrackFusionSourceClass;
}

interface Aggregate {
  samples: number;
  fusedBetter: number;
  canonicalBetter: number;
  ties: number;
  canonicalErrorNmSum: number;
  fusedErrorNmSum: number;
  positionImprovementNmSum: number;
  altitudeSamples: number;
  canonicalAltitudeErrorFtSum: number;
  fusedAltitudeErrorFtSum: number;
}

interface OutcomeBucket {
  startMs: number;
  created: number;
  completed: number;
  expiredWithoutTruth: number;
  byHorizon: Record<number, Aggregate>;
  byScenario: Record<TrackFusionOutcomeScenario, Aggregate>;
}

export interface TrackFusionOutcomeSlice {
  samples: number;
  fusedBetter: number;
  canonicalBetter: number;
  ties: number;
  decisiveSamples: number;
  netWinMargin: number | null;
  canonicalMeanErrorNm: number | null;
  fusedMeanErrorNm: number | null;
  meanErrorRatio: number | null;
  meanImprovementNm: number | null;
  altitudeSamples: number;
  canonicalMeanAltitudeErrorFt: number | null;
  fusedMeanAltitudeErrorFt: number | null;
}

export interface TrackFusionOutcomeReport {
  version: typeof TRACK_FUSION_OUTCOME_VERSION;
  generatedAt: string;
  decision: TrackFusionOutcomeDecision;
  reasons: TrackFusionOutcomeReason[];
  complete: boolean;
  thresholds: typeof TRACK_FUSION_OUTCOME_THRESHOLDS;
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
  overall: TrackFusionOutcomeSlice;
  horizons: Record<string, TrackFusionOutcomeSlice>;
  scenarios: Record<TrackFusionOutcomeScenario, TrackFusionOutcomeSlice>;
}

export interface TrackFusionOutcomeDecisionInput {
  spanMinutes: number;
  overall: TrackFusionOutcomeSlice;
  horizons: TrackFusionOutcomeSlice[];
  handover: TrackFusionOutcomeSlice;
  expiredTruthRate: number | null;
}

export function evaluateTrackFusionOutcomeDecision(
  input: TrackFusionOutcomeDecisionInput,
): { decision: TrackFusionOutcomeDecision; reasons: TrackFusionOutcomeReason[]; complete: boolean } {
  const reasons: TrackFusionOutcomeReason[] = [];
  if (input.spanMinutes < TRACK_FUSION_OUTCOME_THRESHOLDS.minimumSpanMinutes) reasons.push("process_window_insufficient");
  if (input.overall.samples < TRACK_FUSION_OUTCOME_THRESHOLDS.minimumSamples) reasons.push("samples_insufficient");
  if (input.horizons.some((slice) => slice.samples < TRACK_FUSION_OUTCOME_THRESHOLDS.minimumSamplesPerHorizon)) {
    reasons.push("horizon_samples_insufficient");
  }
  if (input.handover.samples < TRACK_FUSION_OUTCOME_THRESHOLDS.minimumHandoverSamples) reasons.push("handover_samples_insufficient");

  const complete = reasons.length === 0;
  if (complete) {
    if (input.overall.netWinMargin === null || input.overall.netWinMargin < TRACK_FUSION_OUTCOME_THRESHOLDS.minimumNetWinMargin) {
      reasons.push("net_win_margin_low");
    }
    if (input.overall.meanErrorRatio === null || input.overall.meanErrorRatio > TRACK_FUSION_OUTCOME_THRESHOLDS.maximumMeanErrorRatio) {
      reasons.push("mean_error_ratio_high");
    }
    if (input.handover.meanErrorRatio === null || input.handover.meanErrorRatio > TRACK_FUSION_OUTCOME_THRESHOLDS.maximumHandoverMeanErrorRatio) {
      reasons.push("handover_mean_error_ratio_high");
    }
    if (input.expiredTruthRate === null || input.expiredTruthRate > TRACK_FUSION_OUTCOME_THRESHOLDS.maximumExpiredTruthRate) {
      reasons.push("expired_truth_rate_high");
    }
  }

  return {
    decision: !complete ? "WAIT" : reasons.length ? "FAIL" : "PASS",
    reasons,
    complete,
  };
}

export interface TrackFusionOutcomeObserveInput {
  local: ReadonlyMap<string, Aircraft>;
  network: ReadonlyMap<string, Aircraft>;
  evaluatedTracks: readonly TrackFusionTrack[];
  receiver: ReceiverPosition;
  localStaleAfterMs: number;
  networkStaleAfterMs: number;
  sourcePreferences?: ReadonlyMap<string, "local" | "network">;
  now?: number;
}

function emptyAggregate(): Aggregate {
  return {
    samples: 0,
    fusedBetter: 0,
    canonicalBetter: 0,
    ties: 0,
    canonicalErrorNmSum: 0,
    fusedErrorNmSum: 0,
    positionImprovementNmSum: 0,
    altitudeSamples: 0,
    canonicalAltitudeErrorFtSum: 0,
    fusedAltitudeErrorFtSum: 0,
  };
}

function addAggregate(target: Aggregate, source: Aggregate): void {
  target.samples += source.samples;
  target.fusedBetter += source.fusedBetter;
  target.canonicalBetter += source.canonicalBetter;
  target.ties += source.ties;
  target.canonicalErrorNmSum += source.canonicalErrorNmSum;
  target.fusedErrorNmSum += source.fusedErrorNmSum;
  target.positionImprovementNmSum += source.positionImprovementNmSum;
  target.altitudeSamples += source.altitudeSamples;
  target.canonicalAltitudeErrorFtSum += source.canonicalAltitudeErrorFtSum;
  target.fusedAltitudeErrorFtSum += source.fusedAltitudeErrorFtSum;
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function normalizedTrack(value: number): number {
  return ((value % 360) + 360) % 360;
}

function projectPosition(state: ProjectionState, at: number): { lat: number; lon: number } {
  const elapsedHours = Math.max(0, at - state.positionObservedAt) / 3_600_000;
  const distanceNm = state.groundSpeedKt * elapsedHours;
  if (distanceNm <= 0) return { ...state.position };
  const [lon, lat] = destination(
    [state.position.lon, state.position.lat],
    distanceNm,
    normalizedTrack(state.trackDeg),
  );
  return { lat, lon };
}

function projectAltitude(state: ProjectionState, at: number): number | null {
  if (!finite(state.altitudeFt)) return null;
  if (!finite(state.verticalRateFpm)) return state.altitudeFt;
  const elapsedMinutes = Math.max(0, at - state.positionObservedAt) / 60_000;
  return Math.max(0, Math.min(60_000, state.altitudeFt + state.verticalRateFpm * elapsedMinutes));
}

function truthAltitude(aircraft: Aircraft): number | null {
  return finite(aircraft.baroAltitude)
    ? aircraft.baroAltitude
    : finite(aircraft.altitude)
      ? aircraft.altitude
      : finite(aircraft.geomAltitude)
        ? aircraft.geomAltitude
        : null;
}

function canonicalState(aircraft: Aircraft): ProjectionState | null {
  if (!hasUsablePosition(aircraft) || !finite(aircraft.groundSpeed) || !finite(aircraft.track)) return null;
  const observedAt = positionObservedAt(aircraft);
  if (observedAt === null) return null;
  return {
    position: { lat: aircraft.lat!, lon: aircraft.lon! },
    positionObservedAt: observedAt,
    groundSpeedKt: aircraft.groundSpeed,
    trackDeg: aircraft.track,
    altitudeFt: truthAltitude(aircraft),
    verticalRateFpm: finite(aircraft.verticalRate)
      ? aircraft.verticalRate
      : finite(aircraft.baroRate)
        ? aircraft.baroRate
        : finite(aircraft.geomRate)
          ? aircraft.geomRate
          : null,
  };
}

function fusedState(track: TrackFusionTrack): ProjectionState | null {
  const position = track.position;
  const speed = track.groundSpeed;
  const heading = track.track;
  if (
    !position || position.estimated || position.confidence === "LOW"
    || !speed || speed.estimated || speed.confidence === "LOW"
    || !heading || heading.estimated || heading.confidence === "LOW"
  ) return null;
  const observedAt = Date.parse(position.observedAt);
  if (!Number.isFinite(observedAt)) return null;
  return {
    position: { ...position.value },
    positionObservedAt: observedAt,
    groundSpeedKt: speed.value,
    trackDeg: heading.value,
    altitudeFt: track.altitude && !track.altitude.estimated && track.altitude.confidence !== "LOW"
      ? track.altitude.value
      : null,
    verticalRateFpm: track.verticalRate && !track.verticalRate.estimated && track.verticalRate.confidence !== "LOW"
      ? track.verticalRate.value
      : null,
  };
}

function winner(canonicalErrorNm: number, fusedErrorNm: number): TrackFusionOutcomeWinner {
  const improvement = canonicalErrorNm - fusedErrorNm;
  if (Math.abs(improvement) <= POSITION_TIE_NM) return "TIE";
  return improvement > 0 ? "FUSED" : "CANONICAL";
}

function scenario(
  previous: TrackFusionSourceClass | null,
  current: TrackFusionSourceClass,
): TrackFusionOutcomeScenario {
  if (previous === "LOCAL" && current === "NETWORK") return "HANDOVER_LOCAL_TO_NETWORK";
  if (previous === "NETWORK" && current === "LOCAL") return "HANDOVER_NETWORK_TO_LOCAL";
  return current === "LOCAL" ? "STEADY_LOCAL" : "STEADY_NETWORK";
}

function aggregateToSlice(value: Aggregate): TrackFusionOutcomeSlice {
  const decisive = value.fusedBetter + value.canonicalBetter;
  const canonicalMean = value.samples ? value.canonicalErrorNmSum / value.samples : null;
  const fusedMean = value.samples ? value.fusedErrorNmSum / value.samples : null;
  return {
    samples: value.samples,
    fusedBetter: value.fusedBetter,
    canonicalBetter: value.canonicalBetter,
    ties: value.ties,
    decisiveSamples: decisive,
    netWinMargin: decisive ? (value.fusedBetter - value.canonicalBetter) / decisive : null,
    canonicalMeanErrorNm: canonicalMean === null ? null : Number(canonicalMean.toFixed(3)),
    fusedMeanErrorNm: fusedMean === null ? null : Number(fusedMean.toFixed(3)),
    meanErrorRatio: canonicalMean && canonicalMean > 0 && fusedMean !== null
      ? Number((fusedMean / canonicalMean).toFixed(3))
      : null,
    meanImprovementNm: value.samples
      ? Number((value.positionImprovementNmSum / value.samples).toFixed(3))
      : null,
    altitudeSamples: value.altitudeSamples,
    canonicalMeanAltitudeErrorFt: value.altitudeSamples
      ? Math.round(value.canonicalAltitudeErrorFtSum / value.altitudeSamples)
      : null,
    fusedMeanAltitudeErrorFt: value.altitudeSamples
      ? Math.round(value.fusedAltitudeErrorFtSum / value.altitudeSamples)
      : null,
  };
}

function handoverScenario(value: TrackFusionOutcomeScenario): boolean {
  return value === "HANDOVER_LOCAL_TO_NETWORK" || value === "HANDOVER_NETWORK_TO_LOCAL";
}

export class TrackFusionOutcomeValidator {
  private readonly pending = new Map<string, PendingOutcomeSample>();
  private readonly lastBaselineAt = new Map<string, number>();
  private readonly lastFusedSource = new Map<string, TrackFusionSourceClass>();
  private buckets: OutcomeBucket[] = [];
  private firstObservedAt: number | null = null;

  observe(input: TrackFusionOutcomeObserveInput): void {
    const now = input.now ?? Date.now();
    if (this.firstObservedAt === null) this.firstObservedAt = now;
    this.resolvePending(input.local, now);

    for (const track of input.evaluatedTracks) {
      const currentSource = track.position && !track.position.estimated
        && (track.position.sourceClass === "LOCAL" || track.position.sourceClass === "NETWORK")
        ? track.position.sourceClass
        : null;
      const previousSource = this.lastFusedSource.get(track.icaoHex) ?? null;
      if (currentSource) this.lastFusedSource.set(track.icaoHex, currentSource);

      if (track.quality !== "GOOD" && track.quality !== "DEGRADED") continue;
      if (!currentSource) continue;
      const kind = scenario(previousSource, currentSource);
      const previousBaselineAt = this.lastBaselineAt.get(track.icaoHex) ?? Number.NEGATIVE_INFINITY;
      if (now - previousBaselineAt < BASELINE_INTERVAL_MS && !handoverScenario(kind)) continue;

      const canonical = mergeAircraftObservations(
        input.local.get(track.icaoHex),
        input.network.get(track.icaoHex),
        input.receiver,
        {
          localStaleAfterMs: input.localStaleAfterMs,
          networkStaleAfterMs: input.networkStaleAfterMs,
          now,
          preferredOrigin: input.sourcePreferences?.get(track.icaoHex),
        },
      );
      if (!canonical) continue;
      const canonicalProjection = canonicalState(canonical);
      const fusedProjection = fusedState(track);
      if (!canonicalProjection || !fusedProjection) continue;

      for (const horizonSeconds of TRACK_FUSION_OUTCOME_HORIZONS_SECONDS) {
        const targetAt = now + horizonSeconds * 1_000;
        const id = `${track.icaoHex}:${now}:${horizonSeconds}`;
        this.pending.set(id, {
          id,
          icaoHex: track.icaoHex,
          createdAt: now,
          targetAt,
          expiresAt: targetAt + TRUTH_GRACE_MS,
          horizonSeconds,
          scenario: kind,
          canonical: canonicalProjection,
          fused: fusedProjection,
          fusedPositionSource: currentSource,
        });
        this.bucketFor(now).created += 1;
      }
      this.lastBaselineAt.set(track.icaoHex, now);
    }

    this.cleanup(now);
  }

  report(now = new Date()): TrackFusionOutcomeReport {
    const nowMs = now.getTime();
    const cutoff = nowMs - WINDOW_MS;
    const buckets = this.buckets.filter((bucket) => bucket.startMs + BUCKET_MS > cutoff);
    const overall = emptyAggregate();
    const byHorizon = new Map<number, Aggregate>();
    const byScenario = new Map<TrackFusionOutcomeScenario, Aggregate>();
    for (const horizon of TRACK_FUSION_OUTCOME_HORIZONS_SECONDS) byHorizon.set(horizon, emptyAggregate());
    for (const value of ["STEADY_LOCAL", "STEADY_NETWORK", "HANDOVER_LOCAL_TO_NETWORK", "HANDOVER_NETWORK_TO_LOCAL"] as const) {
      byScenario.set(value, emptyAggregate());
    }

    let windowCreated = 0;
    let windowCompleted = 0;
    let windowExpiredWithoutTruth = 0;
    for (const bucket of buckets) {
      windowCreated += bucket.created;
      windowCompleted += bucket.completed;
      windowExpiredWithoutTruth += bucket.expiredWithoutTruth;
      for (const [horizon, aggregate] of Object.entries(bucket.byHorizon)) {
        const target = byHorizon.get(Number(horizon));
        if (target) addAggregate(target, aggregate);
        addAggregate(overall, aggregate);
      }
      for (const [name, aggregate] of Object.entries(bucket.byScenario) as Array<[TrackFusionOutcomeScenario, Aggregate]>) {
        addAggregate(byScenario.get(name)!, aggregate);
      }
    }

    const first = Math.max(cutoff, this.firstObservedAt ?? nowMs);
    const spanMinutes = Math.max(0, Math.min(TRACK_FUSION_OUTCOME_WINDOW_MINUTES, (nowMs - first) / 60_000));
    const overallSlice = aggregateToSlice(overall);
    const horizonSlices = Object.fromEntries(
      [...byHorizon.entries()].map(([horizon, aggregate]) => [String(horizon), aggregateToSlice(aggregate)]),
    );
    const scenarioSlices = Object.fromEntries(
      [...byScenario.entries()].map(([name, aggregate]) => [name, aggregateToSlice(aggregate)]),
    ) as Record<TrackFusionOutcomeScenario, TrackFusionOutcomeSlice>;

    const handover = emptyAggregate();
    for (const [name, aggregate] of byScenario) if (handoverScenario(name)) addAggregate(handover, aggregate);
    const handoverSlice = aggregateToSlice(handover);
    const evaluatedOrExpired = windowCompleted + windowExpiredWithoutTruth;
    const expiredTruthRate = evaluatedOrExpired ? windowExpiredWithoutTruth / evaluatedOrExpired : null;

    const evaluated = evaluateTrackFusionOutcomeDecision({
      spanMinutes,
      overall: overallSlice,
      horizons: [...byHorizon.values()].map(aggregateToSlice),
      handover: handoverSlice,
      expiredTruthRate,
    });

    return {
      version: TRACK_FUSION_OUTCOME_VERSION,
      generatedAt: now.toISOString(),
      decision: evaluated.decision,
      reasons: evaluated.reasons,
      complete: evaluated.complete,
      thresholds: TRACK_FUSION_OUTCOME_THRESHOLDS,
      window: {
        from: new Date(first).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        bucketMinutes: TRACK_FUSION_OUTCOME_BUCKET_MINUTES,
        buckets: buckets.length,
        processLocal: true,
      },
      pending: this.pending.size,
      created: windowCreated,
      completed: windowCompleted,
      expiredWithoutTruth: windowExpiredWithoutTruth,
      expiredTruthRate: expiredTruthRate === null ? null : Number(expiredTruthRate.toFixed(4)),
      overall: overallSlice,
      horizons: horizonSlices,
      scenarios: scenarioSlices,
    };
  }

  reset(): void {
    this.pending.clear();
    this.lastBaselineAt.clear();
    this.lastFusedSource.clear();
    this.buckets = [];
    this.firstObservedAt = null;
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
        byHorizon: Object.fromEntries(TRACK_FUSION_OUTCOME_HORIZONS_SECONDS.map((horizon) => [horizon, emptyAggregate()])),
        byScenario: {
          STEADY_LOCAL: emptyAggregate(),
          STEADY_NETWORK: emptyAggregate(),
          HANDOVER_LOCAL_TO_NETWORK: emptyAggregate(),
          HANDOVER_NETWORK_TO_LOCAL: emptyAggregate(),
        },
      };
      this.buckets.push(bucket);
      this.buckets.sort((left, right) => left.startMs - right.startMs);
    }
    return bucket;
  }

  private resolvePending(local: ReadonlyMap<string, Aircraft>, now: number): void {
    for (const [id, sample] of this.pending) {
      if (now < sample.targetAt) continue;
      const truth = local.get(sample.icaoHex);
      const truthAt = truth ? positionObservedAt(truth) : null;

      if (truth && hasUsablePosition(truth) && truthAt !== null && truthAt >= sample.targetAt && truthAt <= sample.expiresAt) {
        this.recordOutcome(sample, truth, truthAt);
        this.pending.delete(id);
        this.bucketFor(truthAt).completed += 1;
        continue;
      }

      if (now > sample.expiresAt || (truthAt !== null && truthAt > sample.expiresAt)) {
        this.pending.delete(id);
        this.bucketFor(Math.min(now, sample.expiresAt)).expiredWithoutTruth += 1;
      }
    }
  }

  private recordOutcome(sample: PendingOutcomeSample, truth: Aircraft, truthAt: number): void {
    const truthPosition = { lat: truth.lat!, lon: truth.lon! };
    const canonicalProjected = projectPosition(sample.canonical, truthAt);
    const fusedProjected = projectPosition(sample.fused, truthAt);
    const canonicalErrorNm = haversineDistanceKm(
      canonicalProjected.lat,
      canonicalProjected.lon,
      truthPosition.lat,
      truthPosition.lon,
    ) / KM_PER_NM;
    const fusedErrorNm = haversineDistanceKm(
      fusedProjected.lat,
      fusedProjected.lon,
      truthPosition.lat,
      truthPosition.lon,
    ) / KM_PER_NM;
    if (!Number.isFinite(canonicalErrorNm) || !Number.isFinite(fusedErrorNm)) return;

    const outcome = emptyAggregate();
    outcome.samples = 1;
    const result = winner(canonicalErrorNm, fusedErrorNm);
    if (result === "FUSED") outcome.fusedBetter = 1;
    else if (result === "CANONICAL") outcome.canonicalBetter = 1;
    else outcome.ties = 1;
    outcome.canonicalErrorNmSum = canonicalErrorNm;
    outcome.fusedErrorNmSum = fusedErrorNm;
    outcome.positionImprovementNmSum = canonicalErrorNm - fusedErrorNm;

    const actualAltitude = truthAltitude(truth);
    const canonicalAltitude = projectAltitude(sample.canonical, truthAt);
    const fusedAltitude = projectAltitude(sample.fused, truthAt);
    if (actualAltitude !== null && canonicalAltitude !== null && fusedAltitude !== null) {
      outcome.altitudeSamples = 1;
      outcome.canonicalAltitudeErrorFtSum = Math.abs(canonicalAltitude - actualAltitude);
      outcome.fusedAltitudeErrorFtSum = Math.abs(fusedAltitude - actualAltitude);
    }

    const bucket = this.bucketFor(truthAt);
    addAggregate(bucket.byHorizon[sample.horizonSeconds]!, outcome);
    addAggregate(bucket.byScenario[sample.scenario], outcome);
  }

  private cleanup(now: number): void {
    for (const [id, sample] of this.pending) {
      if (now - sample.createdAt > PENDING_RETENTION_MS) {
        this.pending.delete(id);
        this.bucketFor(Math.min(now, sample.expiresAt)).expiredWithoutTruth += 1;
      }
    }
    if (this.pending.size > MAX_PENDING) {
      const excess = this.pending.size - MAX_PENDING;
      const oldest = [...this.pending.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, excess);
      for (const sample of oldest) {
        this.pending.delete(sample.id);
        this.bucketFor(now).expiredWithoutTruth += 1;
      }
    }

    const cutoff = now - WINDOW_MS;
    this.buckets = this.buckets
      .filter((bucket) => bucket.startMs + BUCKET_MS > cutoff)
      .slice(-MAX_BUCKETS);

    const identityCutoff = now - WINDOW_MS;
    for (const [hex, at] of this.lastBaselineAt) if (at < identityCutoff) this.lastBaselineAt.delete(hex);
  }
}
