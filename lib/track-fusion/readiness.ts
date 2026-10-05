import type { TrackFusionShadowDiagnostics } from "./types";

export const TRACK_FUSION_READINESS_VERSION = "track-fusion-readiness-v1" as const;
export const TRACK_FUSION_READINESS_WINDOW_MINUTES = 24 * 60;
export const TRACK_FUSION_READINESS_BUCKET_MINUTES = 5;

export const TRACK_FUSION_READINESS_THRESHOLDS = {
  version: TRACK_FUSION_READINESS_VERSION,
  minimumSpanMinutes: 120,
  minimumEvaluations: 5_000,
  minimumPositionComparisons: 200,
  minimumSourceTransitions: 10,
  minimumCanonicalComparisons: 1_000,
  maximumPositionResidualP95Nm: 1,
  maximumPositionDisagreementRate: 0.05,
  maximumRejectedTransitionRate: 0.25,
  maximumEstimatedGapFillRate: 0.10,
  maximumCanonicalDivergenceRate: 0.05,
  maximumCapacityEvictions: 0,
} as const;

export type TrackFusionReadinessDecision = "PASS" | "WAIT" | "FAIL";

export type TrackFusionReadinessReason =
  | "shadow_disabled"
  | "process_window_insufficient"
  | "evaluations_insufficient"
  | "position_comparisons_insufficient"
  | "source_transitions_insufficient"
  | "canonical_comparisons_insufficient"
  | "position_residual_p95_high"
  | "position_disagreement_rate_high"
  | "rejected_transition_rate_high"
  | "estimated_gap_fill_rate_high"
  | "canonical_divergence_rate_high"
  | "capacity_evictions";

export interface TrackFusionReadinessEvidence {
  window: {
    from: string;
    to: string;
    spanMinutes: number;
    bucketMinutes: number;
    buckets: number;
    processLocal: true;
  };
  evaluations: number;
  positionComparisons: number;
  positionDisagreements: number;
  positionResidualP95Nm: number | null;
  positionDisagreementRate: number | null;
  sourceTransitions: number;
  acceptedSourceTransitions: number;
  rejectedSourceTransitions: number;
  rejectedTransitionRate: number | null;
  estimatedGapFills: number;
  estimatedGapFillRate: number | null;
  canonicalPositionComparisons: number;
  canonicalPositionDivergences: number;
  canonicalDivergenceRate: number | null;
  capacityEvictions: number;
}

export interface TrackFusionReadinessReport {
  version: typeof TRACK_FUSION_READINESS_VERSION;
  generatedAt: string;
  decision: TrackFusionReadinessDecision;
  reasons: TrackFusionReadinessReason[];
  complete: boolean;
  thresholds: typeof TRACK_FUSION_READINESS_THRESHOLDS;
  evidence: TrackFusionReadinessEvidence;
  rollout: {
    digitalTwinConfigured: boolean;
    digitalTwinEffective: boolean;
  };
}

interface ValidationCounters {
  evaluations: number;
  positionComparisons: number;
  positionDisagreements: number;
  estimatedGapFills: number;
  acceptedSourceTransitions: number;
  rejectedSourceTransitions: number;
  canonicalPositionComparisons: number;
  canonicalPositionDivergences: number;
  capacityEvictions: number;
  residualHistogram: number[];
}

interface ValidationBucket extends ValidationCounters {
  startMs: number;
}

const BUCKET_MS = TRACK_FUSION_READINESS_BUCKET_MINUTES * 60_000;
const WINDOW_MS = TRACK_FUSION_READINESS_WINDOW_MINUTES * 60_000;
const MAX_BUCKETS = Math.ceil(WINDOW_MS / BUCKET_MS) + 1;

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function counters(diagnostics: TrackFusionShadowDiagnostics): ValidationCounters {
  return {
    evaluations: nonNegative(diagnostics.evaluations),
    positionComparisons: nonNegative(diagnostics.positionComparisons),
    positionDisagreements: nonNegative(diagnostics.positionDisagreements),
    estimatedGapFills: nonNegative(diagnostics.estimatedGapFills),
    acceptedSourceTransitions: nonNegative(diagnostics.acceptedSourceTransitions),
    rejectedSourceTransitions: nonNegative(diagnostics.rejectedSourceTransitions),
    canonicalPositionComparisons: nonNegative(diagnostics.canonicalPositionComparisons),
    canonicalPositionDivergences: nonNegative(diagnostics.canonicalPositionDivergences),
    capacityEvictions: nonNegative(diagnostics.capacityEvictions),
    residualHistogram: diagnostics.positionResidualNm.histogram.map((bucket) => nonNegative(bucket.count)),
  };
}

function emptyCounters(histogramLength: number): ValidationCounters {
  return {
    evaluations: 0,
    positionComparisons: 0,
    positionDisagreements: 0,
    estimatedGapFills: 0,
    acceptedSourceTransitions: 0,
    rejectedSourceTransitions: 0,
    canonicalPositionComparisons: 0,
    canonicalPositionDivergences: 0,
    capacityEvictions: 0,
    residualHistogram: Array.from({ length: histogramLength }, () => 0),
  };
}

function hasCounterReset(previous: ValidationCounters, current: ValidationCounters): boolean {
  const keys: Array<Exclude<keyof ValidationCounters, "residualHistogram">> = [
    "evaluations",
    "positionComparisons",
    "positionDisagreements",
    "estimatedGapFills",
    "acceptedSourceTransitions",
    "rejectedSourceTransitions",
    "canonicalPositionComparisons",
    "canonicalPositionDivergences",
    "capacityEvictions",
  ];
  if (keys.some((key) => current[key] < previous[key])) return true;
  if (current.residualHistogram.length !== previous.residualHistogram.length) return true;
  return current.residualHistogram.some((value, index) => value < (previous.residualHistogram[index] ?? 0));
}

function delta(previous: ValidationCounters, current: ValidationCounters): ValidationCounters {
  return {
    evaluations: current.evaluations - previous.evaluations,
    positionComparisons: current.positionComparisons - previous.positionComparisons,
    positionDisagreements: current.positionDisagreements - previous.positionDisagreements,
    estimatedGapFills: current.estimatedGapFills - previous.estimatedGapFills,
    acceptedSourceTransitions: current.acceptedSourceTransitions - previous.acceptedSourceTransitions,
    rejectedSourceTransitions: current.rejectedSourceTransitions - previous.rejectedSourceTransitions,
    canonicalPositionComparisons: current.canonicalPositionComparisons - previous.canonicalPositionComparisons,
    canonicalPositionDivergences: current.canonicalPositionDivergences - previous.canonicalPositionDivergences,
    capacityEvictions: current.capacityEvictions - previous.capacityEvictions,
    residualHistogram: current.residualHistogram.map((value, index) => value - (previous.residualHistogram[index] ?? 0)),
  };
}

function add(target: ValidationCounters, source: ValidationCounters): void {
  target.evaluations += source.evaluations;
  target.positionComparisons += source.positionComparisons;
  target.positionDisagreements += source.positionDisagreements;
  target.estimatedGapFills += source.estimatedGapFills;
  target.acceptedSourceTransitions += source.acceptedSourceTransitions;
  target.rejectedSourceTransitions += source.rejectedSourceTransitions;
  target.canonicalPositionComparisons += source.canonicalPositionComparisons;
  target.canonicalPositionDivergences += source.canonicalPositionDivergences;
  target.capacityEvictions += source.capacityEvictions;
  for (let index = 0; index < target.residualHistogram.length; index += 1) {
    target.residualHistogram[index] = (target.residualHistogram[index] ?? 0) + (source.residualHistogram[index] ?? 0);
  }
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function p95FromHistogram(
  histogram: number[],
  definition: TrackFusionShadowDiagnostics["positionResidualNm"]["histogram"],
): number | null {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  const target = Math.ceil(total * 0.95);
  let cumulative = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    cumulative += histogram[index] ?? 0;
    if (cumulative < target) continue;
    const upper = definition[index]?.upperBoundNm ?? null;
    // Infinity is represented by null in the diagnostic contract. Returning a
    // value just above the largest finite bucket keeps the readiness comparison
    // conservative without serializing Infinity.
    if (upper === null) {
      const finite = definition.flatMap((bucket) => bucket.upperBoundNm === null ? [] : [bucket.upperBoundNm]);
      return (finite.at(-1) ?? 10) + 0.001;
    }
    return upper;
  }
  return null;
}

export function evaluateTrackFusionReadiness(
  evidence: TrackFusionReadinessEvidence,
  enabled: boolean,
  options: { digitalTwinConfigured?: boolean } = {},
): TrackFusionReadinessReport {
  const waitReasons: TrackFusionReadinessReason[] = [];
  if (!enabled) waitReasons.push("shadow_disabled");
  if (evidence.window.spanMinutes < TRACK_FUSION_READINESS_THRESHOLDS.minimumSpanMinutes) waitReasons.push("process_window_insufficient");
  if (evidence.evaluations < TRACK_FUSION_READINESS_THRESHOLDS.minimumEvaluations) waitReasons.push("evaluations_insufficient");
  if (evidence.positionComparisons < TRACK_FUSION_READINESS_THRESHOLDS.minimumPositionComparisons) waitReasons.push("position_comparisons_insufficient");
  if (evidence.sourceTransitions < TRACK_FUSION_READINESS_THRESHOLDS.minimumSourceTransitions) waitReasons.push("source_transitions_insufficient");
  if (evidence.canonicalPositionComparisons < TRACK_FUSION_READINESS_THRESHOLDS.minimumCanonicalComparisons) waitReasons.push("canonical_comparisons_insufficient");

  const complete = enabled && waitReasons.length === 0;
  const failReasons: TrackFusionReadinessReason[] = [];
  if (complete) {
    if (evidence.positionResidualP95Nm === null || evidence.positionResidualP95Nm > TRACK_FUSION_READINESS_THRESHOLDS.maximumPositionResidualP95Nm) {
      failReasons.push("position_residual_p95_high");
    }
    if (evidence.positionDisagreementRate === null || evidence.positionDisagreementRate > TRACK_FUSION_READINESS_THRESHOLDS.maximumPositionDisagreementRate) {
      failReasons.push("position_disagreement_rate_high");
    }
    if (evidence.rejectedTransitionRate === null || evidence.rejectedTransitionRate > TRACK_FUSION_READINESS_THRESHOLDS.maximumRejectedTransitionRate) {
      failReasons.push("rejected_transition_rate_high");
    }
    if (evidence.estimatedGapFillRate === null || evidence.estimatedGapFillRate > TRACK_FUSION_READINESS_THRESHOLDS.maximumEstimatedGapFillRate) {
      failReasons.push("estimated_gap_fill_rate_high");
    }
    if (evidence.canonicalDivergenceRate === null || evidence.canonicalDivergenceRate > TRACK_FUSION_READINESS_THRESHOLDS.maximumCanonicalDivergenceRate) {
      failReasons.push("canonical_divergence_rate_high");
    }
    if (evidence.capacityEvictions > TRACK_FUSION_READINESS_THRESHOLDS.maximumCapacityEvictions) {
      failReasons.push("capacity_evictions");
    }
  }

  const decision: TrackFusionReadinessDecision = !complete ? "WAIT" : failReasons.length ? "FAIL" : "PASS";
  const digitalTwinConfigured = options.digitalTwinConfigured === true;
  return {
    version: TRACK_FUSION_READINESS_VERSION,
    generatedAt: evidence.window.to,
    decision,
    reasons: !complete ? waitReasons : failReasons,
    complete,
    thresholds: TRACK_FUSION_READINESS_THRESHOLDS,
    evidence,
    rollout: {
      digitalTwinConfigured,
      digitalTwinEffective: digitalTwinConfigured && decision === "PASS",
    },
  };
}

export class TrackFusionReadinessMonitor {
  private previous: ValidationCounters | null = null;
  private firstObservedAtMs: number | null = null;
  private histogramDefinition: TrackFusionShadowDiagnostics["positionResidualNm"]["histogram"] = [];
  private buckets: ValidationBucket[] = [];

  observe(diagnostics: TrackFusionShadowDiagnostics, now = Date.now()): void {
    const current = counters(diagnostics);
    this.histogramDefinition = diagnostics.positionResidualNm.histogram.map((bucket) => ({ ...bucket, count: 0 }));

    if (!this.previous || hasCounterReset(this.previous, current)) {
      this.previous = current;
      this.firstObservedAtMs = now;
      this.buckets = [];
      return;
    }

    const change = delta(this.previous, current);
    this.previous = current;
    if (this.firstObservedAtMs === null) this.firstObservedAtMs = now;

    const bucketStart = Math.floor(now / BUCKET_MS) * BUCKET_MS;
    let bucket = this.buckets.at(-1);
    if (!bucket || bucket.startMs !== bucketStart) {
      bucket = { startMs: bucketStart, ...emptyCounters(current.residualHistogram.length) };
      this.buckets.push(bucket);
    }
    add(bucket, change);

    const cutoff = now - WINDOW_MS;
    this.buckets = this.buckets.filter((candidate) => candidate.startMs + BUCKET_MS > cutoff).slice(-MAX_BUCKETS);
  }

  report(
    enabled: boolean,
    options: { now?: Date; digitalTwinConfigured?: boolean } = {},
  ): TrackFusionReadinessReport {
    const now = options.now ?? new Date();
    const nowMs = now.getTime();
    const cutoff = nowMs - WINDOW_MS;
    const buckets = this.buckets.filter((candidate) => candidate.startMs + BUCKET_MS > cutoff);
    const aggregate = emptyCounters(this.histogramDefinition.length);
    for (const bucket of buckets) add(aggregate, bucket);

    const fromMs = Math.max(
      cutoff,
      this.firstObservedAtMs ?? nowMs,
      buckets[0]?.startMs ?? this.firstObservedAtMs ?? nowMs,
    );
    const spanMinutes = Math.max(0, Math.min(TRACK_FUSION_READINESS_WINDOW_MINUTES, (nowMs - fromMs) / 60_000));
    const sourceTransitions = aggregate.acceptedSourceTransitions + aggregate.rejectedSourceTransitions;
    const evidence: TrackFusionReadinessEvidence = {
      window: {
        from: new Date(fromMs).toISOString(),
        to: now.toISOString(),
        spanMinutes: Number(spanMinutes.toFixed(1)),
        bucketMinutes: TRACK_FUSION_READINESS_BUCKET_MINUTES,
        buckets: buckets.length,
        processLocal: true,
      },
      evaluations: aggregate.evaluations,
      positionComparisons: aggregate.positionComparisons,
      positionDisagreements: aggregate.positionDisagreements,
      positionResidualP95Nm: p95FromHistogram(aggregate.residualHistogram, this.histogramDefinition),
      positionDisagreementRate: rate(aggregate.positionDisagreements, aggregate.positionComparisons),
      sourceTransitions,
      acceptedSourceTransitions: aggregate.acceptedSourceTransitions,
      rejectedSourceTransitions: aggregate.rejectedSourceTransitions,
      rejectedTransitionRate: rate(aggregate.rejectedSourceTransitions, sourceTransitions),
      estimatedGapFills: aggregate.estimatedGapFills,
      estimatedGapFillRate: rate(aggregate.estimatedGapFills, aggregate.evaluations),
      canonicalPositionComparisons: aggregate.canonicalPositionComparisons,
      canonicalPositionDivergences: aggregate.canonicalPositionDivergences,
      canonicalDivergenceRate: rate(aggregate.canonicalPositionDivergences, aggregate.canonicalPositionComparisons),
      capacityEvictions: aggregate.capacityEvictions,
    };

    return evaluateTrackFusionReadiness(evidence, enabled, {
      digitalTwinConfigured: options.digitalTwinConfigured,
    });
  }

  reset(): void {
    this.previous = null;
    this.firstObservedAtMs = null;
    this.histogramDefinition = [];
    this.buckets = [];
  }
}
