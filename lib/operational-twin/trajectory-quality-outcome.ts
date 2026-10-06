import type { Aircraft } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";
import type { OperationalTwinSituation } from "./types";
import type { OperationalTwinTrajectoryPhase } from "./trajectory-quality-v2";

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION =
  "operational-digital-twin-trajectory-quality-outcome-v1" as const;

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_HORIZONS = [5, 15, 30] as const;
export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_WINDOW_MINUTES = 24 * 60;

const MIN_CAPTURE_INTERVAL_MS = 55_000;
const TRUTH_TOLERANCE_MS = 20_000;
const TRUTH_GRACE_MS = 30_000;
const MAX_PENDING = 5_000;
const TIE_TOLERANCE_FT = 100;
const WINDOW_MS = OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_WINDOW_MINUTES * 60_000;

export const OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS = {
  version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION,
  minimumSpanMinutes: 120,
  minimumPairedSamples: 60,
  minimumPairedSamplesPerHorizon: 12,
  minimumTruthCoverage: 0.60,
  tieToleranceFt: TIE_TOLERANCE_FT,
} as const;

export type OperationalTwinTrajectoryQualityOutcomeDecision = "PASS" | "WAIT" | "FAIL";
export type OperationalTwinTrajectoryQualityOutcomeReason =
  | "process_window_insufficient"
  | "paired_samples_insufficient"
  | "horizon_samples_insufficient"
  | "truth_coverage_low";

interface PendingTrajectoryQualitySample {
  id: string;
  icaoHex: string;
  capturedAt: number;
  targetAt: number;
  expiresAt: number;
  horizonMinutes: 5 | 15 | 30;
  phase: OperationalTwinTrajectoryPhase;
  canonicalAltitudeFt: number;
  qualityAltitudeFt: number;
}

interface Aggregate {
  pairedSamples: number;
  canonicalAbsoluteErrorFtSum: number;
  qualityAbsoluteErrorFtSum: number;
  qualityWins: number;
  canonicalWins: number;
  ties: number;
}

export interface OperationalTwinTrajectoryQualityOutcomeSlice {
  pairedSamples: number;
  canonicalMeanAbsoluteErrorFt: number | null;
  qualityMeanAbsoluteErrorFt: number | null;
  meanImprovementFt: number | null;
  relativeMaeImprovement: number | null;
  qualityWins: number;
  canonicalWins: number;
  ties: number;
  qualityWinRate: number | null;
}

export interface OperationalTwinTrajectoryQualityOutcomeReport {
  version: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION;
  generatedAt: string;
  decision: OperationalTwinTrajectoryQualityOutcomeDecision;
  reasons: OperationalTwinTrajectoryQualityOutcomeReason[];
  complete: boolean;
  thresholds: typeof OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS;
  truthSource: "LOCAL_RECEIVER";
  requestDrivenCapture: true;
  refreshDrivenTruthSampling: true;
  canonicalRemainsActive: true;
  autoPromotion: false;
  horizonsMinutes: readonly [5, 15, 30];
  window: {
    from: string;
    to: string;
    spanMinutes: number;
    processLocal: true;
  };
  pending: number;
  created: number;
  completed: number;
  expiredWithoutTruth: number;
  truthCoverage: number | null;
  duplicateCaptureSkips: number;
  capacityEvictions: number;
  overall: OperationalTwinTrajectoryQualityOutcomeSlice;
  horizons: Record<string, OperationalTwinTrajectoryQualityOutcomeSlice>;
  phases: Record<OperationalTwinTrajectoryPhase, OperationalTwinTrajectoryQualityOutcomeSlice>;
  limitations: Array<
    | "OUTCOME_MEASUREMENT_ONLY"
    | "NO_AUTO_PROMOTION"
    | "LOCAL_RECEIVER_TRUTH_ONLY"
    | "PROCESS_LOCAL_V1"
  >;
}

export interface OperationalTwinTrajectoryQualityOutcomeDecisionInput {
  spanMinutes: number;
  overall: OperationalTwinTrajectoryQualityOutcomeSlice;
  horizons: readonly OperationalTwinTrajectoryQualityOutcomeSlice[];
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
    qualityAbsoluteErrorFtSum: 0,
    qualityWins: 0,
    canonicalWins: 0,
    ties: 0,
  };
}

function addAggregate(target: Aggregate, source: Aggregate): void {
  target.pairedSamples += source.pairedSamples;
  target.canonicalAbsoluteErrorFtSum += source.canonicalAbsoluteErrorFtSum;
  target.qualityAbsoluteErrorFtSum += source.qualityAbsoluteErrorFtSum;
  target.qualityWins += source.qualityWins;
  target.canonicalWins += source.canonicalWins;
  target.ties += source.ties;
}

function aggregateSample(target: Aggregate, pending: PendingTrajectoryQualitySample, truthAltitudeFt: number): void {
  const canonicalError = Math.abs(pending.canonicalAltitudeFt - truthAltitudeFt);
  const qualityError = Math.abs(pending.qualityAltitudeFt - truthAltitudeFt);
  target.pairedSamples += 1;
  target.canonicalAbsoluteErrorFtSum += canonicalError;
  target.qualityAbsoluteErrorFtSum += qualityError;

  const delta = canonicalError - qualityError;
  if (Math.abs(delta) <= TIE_TOLERANCE_FT) target.ties += 1;
  else if (delta > 0) target.qualityWins += 1;
  else target.canonicalWins += 1;
}

function sliceFromAggregate(value: Aggregate): OperationalTwinTrajectoryQualityOutcomeSlice {
  if (!value.pairedSamples) {
    return {
      pairedSamples: 0,
      canonicalMeanAbsoluteErrorFt: null,
      qualityMeanAbsoluteErrorFt: null,
      meanImprovementFt: null,
      relativeMaeImprovement: null,
      qualityWins: 0,
      canonicalWins: 0,
      ties: 0,
      qualityWinRate: null,
    };
  }

  const canonicalMae = value.canonicalAbsoluteErrorFtSum / value.pairedSamples;
  const qualityMae = value.qualityAbsoluteErrorFtSum / value.pairedSamples;
  const decisive = value.qualityWins + value.canonicalWins;
  return {
    pairedSamples: value.pairedSamples,
    canonicalMeanAbsoluteErrorFt: Math.round(canonicalMae),
    qualityMeanAbsoluteErrorFt: Math.round(qualityMae),
    meanImprovementFt: Math.round(canonicalMae - qualityMae),
    relativeMaeImprovement: canonicalMae > 0
      ? Number(((canonicalMae - qualityMae) / canonicalMae).toFixed(4))
      : null,
    qualityWins: value.qualityWins,
    canonicalWins: value.canonicalWins,
    ties: value.ties,
    qualityWinRate: decisive
      ? Number((value.qualityWins / decisive).toFixed(4))
      : null,
  };
}

export function evaluateOperationalTwinTrajectoryQualityOutcome(
  input: OperationalTwinTrajectoryQualityOutcomeDecisionInput,
): {
  decision: OperationalTwinTrajectoryQualityOutcomeDecision;
  reasons: OperationalTwinTrajectoryQualityOutcomeReason[];
  complete: boolean;
} {
  const readinessReasons: OperationalTwinTrajectoryQualityOutcomeReason[] = [];
  if (input.spanMinutes < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS.minimumSpanMinutes) {
    readinessReasons.push("process_window_insufficient");
  }
  if (input.overall.pairedSamples < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS.minimumPairedSamples) {
    readinessReasons.push("paired_samples_insufficient");
  }
  if (input.horizons.some((slice) =>
    slice.pairedSamples < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS.minimumPairedSamplesPerHorizon
  )) {
    readinessReasons.push("horizon_samples_insufficient");
  }

  const complete = readinessReasons.length === 0;
  if (!complete) {
    return { decision: "WAIT", reasons: readinessReasons, complete: false };
  }

  if (
    input.truthCoverage === null
    || input.truthCoverage < OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS.minimumTruthCoverage
  ) {
    return { decision: "FAIL", reasons: ["truth_coverage_low"], complete: true };
  }

  return { decision: "PASS", reasons: [], complete: true };
}

export class OperationalTwinTrajectoryQualityOutcomeValidator {
  private readonly pending = new Map<string, PendingTrajectoryQualitySample>();
  private readonly lastCaptureAt = new Map<string, number>();
  private readonly overall = emptyAggregate();
  private readonly byHorizon = new Map<number, Aggregate>(
    OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_HORIZONS.map((horizon) => [horizon, emptyAggregate()]),
  );
  private readonly byPhase = new Map<OperationalTwinTrajectoryPhase, Aggregate>([
    ["CLIMB", emptyAggregate()],
    ["CRUISE", emptyAggregate()],
    ["DESCENT", emptyAggregate()],
    ["LEVEL", emptyAggregate()],
    ["UNKNOWN", emptyAggregate()],
  ]);
  private firstObservedAt: number | null = null;
  private created = 0;
  private completed = 0;
  private expiredWithoutTruth = 0;
  private duplicateCaptureSkips = 0;
  private capacityEvictions = 0;

  capture(situation: OperationalTwinSituation, now = Date.parse(situation.generatedAt)): void {
    if (!Number.isFinite(now)) return;
    const shadow = situation.trajectoryQualityV2;
    if (!shadow || shadow.status !== "AVAILABLE") return;

    const previous = this.lastCaptureAt.get(situation.aircraft.icaoHex) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < MIN_CAPTURE_INTERVAL_MS) {
      this.duplicateCaptureSkips += 1;
      return;
    }

    let created = 0;
    for (const checkpoint of shadow.checkpoints) {
      if (!finite(checkpoint.canonicalAltitudeFt) || !finite(checkpoint.qualityAltitudeFt)) continue;
      const horizonMinutes = checkpoint.offsetMinutes;
      if (!OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_HORIZONS.includes(horizonMinutes)) continue;
      const targetAt = now + horizonMinutes * 60_000;
      const id = `${situation.aircraft.icaoHex}:${now}:${horizonMinutes}`;
      this.pending.set(id, {
        id,
        icaoHex: situation.aircraft.icaoHex,
        capturedAt: now,
        targetAt,
        expiresAt: targetAt + TRUTH_GRACE_MS,
        horizonMinutes,
        phase: shadow.phase,
        canonicalAltitudeFt: checkpoint.canonicalAltitudeFt,
        qualityAltitudeFt: checkpoint.qualityAltitudeFt,
      });
      this.created += 1;
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
      const truthAltitude = aircraft ? truthAltitudeAt(aircraft, pending.targetAt) : null;
      if (truthAltitude !== null) {
        aggregateSample(this.overall, pending, truthAltitude);
        aggregateSample(this.byHorizon.get(pending.horizonMinutes)!, pending, truthAltitude);
        aggregateSample(this.byPhase.get(pending.phase)!, pending, truthAltitude);
        this.completed += 1;
        this.pending.delete(id);
        continue;
      }
      if (now > pending.expiresAt) {
        this.expiredWithoutTruth += 1;
        this.pending.delete(id);
      }
    }
    this.cleanup(now);
  }

  report(now = new Date()): OperationalTwinTrajectoryQualityOutcomeReport {
    const nowMs = now.getTime();
    const first = Math.max(nowMs - WINDOW_MS, this.firstObservedAt ?? nowMs);
    const spanMinutes = Math.max(0, Math.min(
      OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_WINDOW_MINUTES,
      (nowMs - first) / 60_000,
    ));
    const evaluatedOrExpired = this.completed + this.expiredWithoutTruth;
    const truthCoverage = evaluatedOrExpired ? this.completed / evaluatedOrExpired : null;
    const horizonSlices = Object.fromEntries(
      [...this.byHorizon.entries()].map(([horizon, aggregate]) => [String(horizon), sliceFromAggregate(aggregate)]),
    );
    const phaseSlices = Object.fromEntries(
      [...this.byPhase.entries()].map(([phase, aggregate]) => [phase, sliceFromAggregate(aggregate)]),
    ) as Record<OperationalTwinTrajectoryPhase, OperationalTwinTrajectoryQualityOutcomeSlice>;
    const overallSlice = sliceFromAggregate(this.overall);
    const evaluated = evaluateOperationalTwinTrajectoryQualityOutcome({
      spanMinutes,
      overall: overallSlice,
      horizons: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_HORIZONS.map((horizon) =>
        horizonSlices[String(horizon)]!
      ),
      truthCoverage,
    });

    return {
      version: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_VERSION,
      generatedAt: now.toISOString(),
      decision: evaluated.decision,
      reasons: evaluated.reasons,
      complete: evaluated.complete,
      thresholds: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_THRESHOLDS,
      truthSource: "LOCAL_RECEIVER",
      requestDrivenCapture: true,
      refreshDrivenTruthSampling: true,
      canonicalRemainsActive: true,
      autoPromotion: false,
      horizonsMinutes: OPERATIONAL_TWIN_TRAJECTORY_QUALITY_OUTCOME_HORIZONS,
      window: {
        from: new Date(first).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        processLocal: true,
      },
      pending: this.pending.size,
      created: this.created,
      completed: this.completed,
      expiredWithoutTruth: this.expiredWithoutTruth,
      truthCoverage: truthCoverage === null ? null : Number(truthCoverage.toFixed(4)),
      duplicateCaptureSkips: this.duplicateCaptureSkips,
      capacityEvictions: this.capacityEvictions,
      overall: overallSlice,
      horizons: horizonSlices,
      phases: phaseSlices,
      limitations: [
        "OUTCOME_MEASUREMENT_ONLY",
        "NO_AUTO_PROMOTION",
        "LOCAL_RECEIVER_TRUTH_ONLY",
        "PROCESS_LOCAL_V1",
      ],
    };
  }

  reset(): void {
    this.pending.clear();
    this.lastCaptureAt.clear();
    this.overall.pairedSamples = 0;
    this.overall.canonicalAbsoluteErrorFtSum = 0;
    this.overall.qualityAbsoluteErrorFtSum = 0;
    this.overall.qualityWins = 0;
    this.overall.canonicalWins = 0;
    this.overall.ties = 0;
    for (const aggregate of this.byHorizon.values()) Object.assign(aggregate, emptyAggregate());
    for (const aggregate of this.byPhase.values()) Object.assign(aggregate, emptyAggregate());
    this.firstObservedAt = null;
    this.created = 0;
    this.completed = 0;
    this.expiredWithoutTruth = 0;
    this.duplicateCaptureSkips = 0;
    this.capacityEvictions = 0;
  }

  private enforceCapacity(): void {
    while (this.pending.size > MAX_PENDING) {
      const oldest = [...this.pending.values()].sort((a, b) => a.capturedAt - b.capturedAt)[0];
      if (!oldest) break;
      this.pending.delete(oldest.id);
      this.capacityEvictions += 1;
    }
  }

  private cleanup(now: number): void {
    for (const [hex, capturedAt] of this.lastCaptureAt) {
      if (capturedAt < now - WINDOW_MS) this.lastCaptureAt.delete(hex);
    }
  }
}
