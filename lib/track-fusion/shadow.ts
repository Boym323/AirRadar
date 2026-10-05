import type { Aircraft, ReceiverPosition } from "@/lib/aircraft/types";
import { mergeAircraftObservations } from "@/lib/aircraft/source-merge";
import { haversineDistanceKm } from "@/lib/geo";
import { destination } from "@/lib/atc-context/geometry";
import {
  buildTrackFusionObservation,
  fieldUncertainty,
  positionUncertaintyNm,
  type TrackFusionObservation,
} from "./observation";
import {
  TRACK_FUSION_SHADOW_VERSION,
  type TrackFusionConfidence,
  type TrackFusionFieldCandidate,
  type TrackFusionFieldEstimate,
  type TrackFusionFieldName,
  type TrackFusionPositionValue,
  type TrackFusionRecentDisagreement,
  type TrackFusionShadowDiagnostics,
  type TrackFusionSourceClass,
  type TrackFusionTrack,
  type TrackFusionTrackQuality,
} from "./types";

const MAX_ESTIMATION_GAP_MS = 6_000;
const MAX_FIELD_HOLD_MS = 10_000;
const TRACK_RETENTION_MS = 120_000;
const MAX_TRACKS = 25_000;
const MAX_RECENT_DISAGREEMENTS = 20;
const POSITION_DISAGREEMENT_NM = 2;
const CANONICAL_DIVERGENCE_NM = 0.5;
const RESIDUAL_BUCKETS = [0.1, 0.25, 0.5, 1, 2, 5, 10, Number.POSITIVE_INFINITY] as const;

interface TrackMemory {
  state: TrackFusionTrack;
  fingerprint: string;
  lastEvaluatedAt: number;
  /** Last accepted non-estimated position. Rejected handovers never replace it. */
  anchorPosition: TrackFusionFieldEstimate<TrackFusionPositionValue> | null;
}

interface ResidualAccumulator {
  count: number;
  sum: number;
  maximum: number;
  buckets: number[];
}

function emptySelections(): TrackFusionShadowDiagnostics["fieldSelections"] {
  return {
    position: { local: 0, network: 0, estimated: 0 },
    altitude: { local: 0, network: 0, estimated: 0 },
    groundSpeed: { local: 0, network: 0, estimated: 0 },
    track: { local: 0, network: 0, estimated: 0 },
    verticalRate: { local: 0, network: 0, estimated: 0 },
  };
}

function emptyResidual(): ResidualAccumulator {
  return { count: 0, sum: 0, maximum: 0, buckets: RESIDUAL_BUCKETS.map(() => 0) };
}

function confidenceFromScore(score: number): TrackFusionConfidence {
  if (score >= 88) return "HIGH";
  if (score >= 68) return "MEDIUM";
  return "LOW";
}

function candidateOrder<T>(left: TrackFusionFieldCandidate<T>, right: TrackFusionFieldCandidate<T>): number {
  if (left.score !== right.score) return right.score - left.score;
  if (left.ageMs !== right.ageMs) return left.ageMs - right.ageMs;
  if (left.sourceClass !== right.sourceClass) return left.sourceClass === "LOCAL" ? -1 : 1;
  return right.observedAt - left.observedAt;
}

function bestCandidate<T>(values: Array<TrackFusionFieldCandidate<T> | null>): TrackFusionFieldCandidate<T> | null {
  return values.filter((value): value is TrackFusionFieldCandidate<T> => value !== null).sort(candidateOrder)[0] ?? null;
}

function estimateFromCandidate<T>(
  candidate: TrackFusionFieldCandidate<T>,
  uncertainty: number | null,
): TrackFusionFieldEstimate<T> {
  return {
    value: candidate.value,
    observedAt: new Date(candidate.observedAt).toISOString(),
    sourceClass: candidate.sourceClass,
    origin: candidate.origin,
    source: candidate.source,
    protocol: candidate.protocol,
    score: candidate.score,
    confidence: candidate.confidence,
    ageMs: candidate.ageMs,
    uncertainty,
    estimated: false,
  };
}

function residualNm(left: TrackFusionPositionValue, right: TrackFusionPositionValue): number {
  return haversineDistanceKm(left.lat, left.lon, right.lat, right.lon) / 1.852;
}

function projectObservedPosition(
  position: TrackFusionFieldEstimate<TrackFusionPositionValue>,
  groundSpeedKt: number | null | undefined,
  trackDeg: number | null | undefined,
  targetAt: number,
): TrackFusionPositionValue {
  const observedAt = Date.parse(position.observedAt);
  if (!Number.isFinite(observedAt) || targetAt <= observedAt) return position.value;
  if (groundSpeedKt === null || groundSpeedKt === undefined || trackDeg === null || trackDeg === undefined) {
    return position.value;
  }
  const elapsedHours = (targetAt - observedAt) / 3_600_000;
  const distanceNm = Math.max(0, groundSpeedKt * elapsedHours);
  const [lon, lat] = destination([position.value.lon, position.value.lat], distanceNm, trackDeg);
  return { lat, lon };
}

function holdNumeric(
  previous: TrackFusionFieldEstimate<number> | null,
  now: number,
): TrackFusionFieldEstimate<number> | null {
  if (!previous) return null;
  const observedAt = Date.parse(previous.observedAt);
  if (!Number.isFinite(observedAt) || now - observedAt > MAX_FIELD_HOLD_MS) return null;
  const ageMs = Math.max(0, now - observedAt);
  const score = Math.max(0, previous.score - Math.round(ageMs / 2_000));
  return {
    ...previous,
    sourceClass: "ESTIMATED",
    origin: null,
    source: "ESTIMATED",
    protocol: "held",
    score,
    confidence: confidenceFromScore(score),
    ageMs,
    uncertainty: previous.uncertainty === null ? null : Number((previous.uncertainty * (1 + ageMs / 20_000)).toFixed(2)),
    estimated: true,
  };
}

function trackQuality(position: TrackFusionFieldEstimate<TrackFusionPositionValue> | null): TrackFusionTrackQuality {
  if (!position) return "NO_POSITION";
  if (position.estimated) return "ESTIMATED";
  if (position.score >= 68 && (position.uncertainty ?? Number.POSITIVE_INFINITY) <= 2) return "GOOD";
  return "DEGRADED";
}

function sourceKey(source: TrackFusionSourceClass | "ESTIMATED"): "local" | "network" | "estimated" {
  return source === "LOCAL" ? "local" : source === "NETWORK" ? "network" : "estimated";
}

export interface TrackFusionShadowInput {
  local: ReadonlyMap<string, Aircraft>;
  network: ReadonlyMap<string, Aircraft>;
  receiver: ReceiverPosition;
  localStaleAfterMs: number;
  networkStaleAfterMs: number;
  sourcePreferences?: ReadonlyMap<string, "local" | "network">;
  now?: number;
}

export class TrackFusionShadow {
  private readonly tracks = new Map<string, TrackMemory>();
  private evaluations = 0;
  private dedupedEvaluations = 0;
  private positionComparisons = 0;
  private positionDisagreements = 0;
  private estimatedGapFills = 0;
  private acceptedSourceTransitions = 0;
  private rejectedSourceTransitions = 0;
  private canonicalPositionComparisons = 0;
  private canonicalPositionDivergences = 0;
  private capacityEvictions = 0;
  private readonly fieldSelections = emptySelections();
  private readonly positionResidual = emptyResidual();
  private readonly canonicalResidual = emptyResidual();
  private recentDisagreements: TrackFusionRecentDisagreement[] = [];
  private lastEvaluatedAt: number | null = null;
  private currentOverlapTracks = 0;

  constructor(private readonly enabled = true) {}

  observe(input: TrackFusionShadowInput): TrackFusionTrack[] {
    if (!this.enabled) return [];
    const now = input.now ?? Date.now();
    const keys = new Set([...input.local.keys(), ...input.network.keys()]);
    const evaluatedTracks: TrackFusionTrack[] = [];
    let overlapTracks = 0;

    for (const hex of keys) {
      const localAircraft = input.local.get(hex);
      const networkAircraft = input.network.get(hex);
      const local = localAircraft ? buildTrackFusionObservation(localAircraft, now) : null;
      const network = networkAircraft ? buildTrackFusionObservation(networkAircraft, now) : null;
      if (local && network) overlapTracks += 1;
      const fingerprint = `${local?.fingerprint ?? "-"}|${network?.fingerprint ?? "-"}`;
      const memory = this.tracks.get(hex);

      const hasFreshPosition = Boolean(local?.position || network?.position);
      if (memory?.fingerprint === fingerprint && hasFreshPosition) {
        memory.lastEvaluatedAt = now;
        this.dedupedEvaluations += 1;
        continue;
      }

      const next = this.fuseTrack({
        hex,
        local,
        network,
        previous: memory?.state ?? null,
        anchorPosition: memory?.anchorPosition ?? null,
        canonical: mergeAircraftObservations(localAircraft, networkAircraft, input.receiver, {
          localStaleAfterMs: input.localStaleAfterMs,
          networkStaleAfterMs: input.networkStaleAfterMs,
          now,
          preferredOrigin: input.sourcePreferences?.get(hex),
        }),
        now,
      });
      const anchorPosition = next.position && !next.position.estimated
        ? next.position
        : memory?.anchorPosition ?? null;
      this.tracks.set(hex, { state: next, fingerprint, lastEvaluatedAt: now, anchorPosition });
      evaluatedTracks.push(next);
      this.evaluations += 1;
    }

    for (const [hex, memory] of this.tracks) {
      if (!keys.has(hex) && now - memory.lastEvaluatedAt > TRACK_RETENTION_MS) this.tracks.delete(hex);
    }
    if (this.tracks.size > MAX_TRACKS) {
      const excess = this.tracks.size - MAX_TRACKS;
      const oldest = [...this.tracks.entries()]
        .sort((left, right) => left[1].lastEvaluatedAt - right[1].lastEvaluatedAt)
        .slice(0, excess);
      for (const [hex] of oldest) this.tracks.delete(hex);
      this.capacityEvictions += oldest.length;
    }
    this.currentOverlapTracks = overlapTracks;
    this.lastEvaluatedAt = now;
    return evaluatedTracks;
  }

  getTrack(icaoHex: string): TrackFusionTrack | null {
    return this.tracks.get(icaoHex.toUpperCase())?.state ?? null;
  }

  diagnostics(): TrackFusionShadowDiagnostics {
    let goodTracks = 0;
    let degradedTracks = 0;
    let estimatedTracks = 0;
    let noPositionTracks = 0;
    for (const { state } of this.tracks.values()) {
      if (state.quality === "GOOD") goodTracks += 1;
      else if (state.quality === "DEGRADED") degradedTracks += 1;
      else if (state.quality === "ESTIMATED") estimatedTracks += 1;
      else noPositionTracks += 1;
    }
    return {
      version: TRACK_FUSION_SHADOW_VERSION,
      enabled: this.enabled,
      evaluatedTracks: goodTracks + degradedTracks + estimatedTracks + noPositionTracks,
      activeTracks: this.tracks.size,
      overlapTracks: this.currentOverlapTracks,
      goodTracks,
      degradedTracks,
      estimatedTracks,
      noPositionTracks,
      capacityEvictions: this.capacityEvictions,
      evaluations: this.evaluations,
      dedupedEvaluations: this.dedupedEvaluations,
      positionComparisons: this.positionComparisons,
      positionDisagreements: this.positionDisagreements,
      estimatedGapFills: this.estimatedGapFills,
      acceptedSourceTransitions: this.acceptedSourceTransitions,
      rejectedSourceTransitions: this.rejectedSourceTransitions,
      canonicalPositionComparisons: this.canonicalPositionComparisons,
      canonicalPositionDivergences: this.canonicalPositionDivergences,
      fieldSelections: structuredClone(this.fieldSelections),
      positionResidualNm: this.residualSummary(this.positionResidual, true),
      canonicalResidualNm: this.residualSummary(this.canonicalResidual, false),
      lastEvaluatedAt: this.lastEvaluatedAt === null ? null : new Date(this.lastEvaluatedAt).toISOString(),
      recentDisagreements: this.recentDisagreements.slice(),
    };
  }

  private fuseTrack(input: {
    hex: string;
    local: TrackFusionObservation | null;
    network: TrackFusionObservation | null;
    previous: TrackFusionTrack | null;
    anchorPosition: TrackFusionFieldEstimate<TrackFusionPositionValue> | null;
    canonical: Aircraft | null;
    now: number;
  }): TrackFusionTrack {
    const localPosition = input.local?.position ?? null;
    const networkPosition = input.network?.position ?? null;
    let positionResidualNm: number | null = null;

    if (localPosition && networkPosition) {
      positionResidualNm = residualNm(localPosition.value, networkPosition.value);
      this.positionComparisons += 1;
      this.recordResidual(this.positionResidual, positionResidualNm);
      if (positionResidualNm >= POSITION_DISAGREEMENT_NM) {
        this.positionDisagreements += 1;
        this.pushDisagreement({
          icaoHex: input.hex,
          observedAt: new Date(input.now).toISOString(),
          residualNm: Number(positionResidualNm.toFixed(3)),
          selectedSource: bestCandidate([localPosition, networkPosition])?.sourceClass ?? "ESTIMATED",
          localSource: input.local?.source ?? null,
          networkSource: input.network?.source ?? null,
        });
      }
    }

    const positionCandidates = [localPosition, networkPosition]
      .filter((value): value is TrackFusionFieldCandidate<TrackFusionPositionValue> => value !== null)
      .sort(candidateOrder);
    let selectedPosition: TrackFusionFieldCandidate<TrackFusionPositionValue> | null = positionCandidates[0] ?? null;
    let rejectedTransition = false;

    if (
      selectedPosition
      && input.anchorPosition
      && input.anchorPosition.sourceClass !== "ESTIMATED"
      && input.anchorPosition.sourceClass !== selectedPosition.sourceClass
    ) {
      const predicted = projectObservedPosition(
        input.anchorPosition,
        input.previous?.groundSpeed?.value,
        input.previous?.track?.value,
        selectedPosition.observedAt,
      );
      const candidateUncertainty = positionUncertaintyNm(selectedPosition);
      const threshold = Math.max(3, (input.anchorPosition.uncertainty ?? 1.5) + candidateUncertainty + 0.75);
      const handoverResidual = residualNm(predicted, selectedPosition.value);
      if (handoverResidual > threshold) {
        const alternate = positionCandidates.find((candidate) => candidate.sourceClass === input.anchorPosition!.sourceClass) ?? null;
        if (alternate) selectedPosition = alternate;
        else selectedPosition = null;
        rejectedTransition = true;
        this.rejectedSourceTransitions += 1;
      } else {
        this.acceptedSourceTransitions += 1;
      }
    }

    let position: TrackFusionFieldEstimate<TrackFusionPositionValue> | null = selectedPosition
      ? estimateFromCandidate(selectedPosition, positionUncertaintyNm(selectedPosition))
      : null;

    if (!position && input.anchorPosition) {
      const anchorAt = Date.parse(input.anchorPosition.observedAt);
      const gapMs = Number.isFinite(anchorAt) ? Math.max(0, input.now - anchorAt) : Number.POSITIVE_INFINITY;
      if (Number.isFinite(anchorAt) && gapMs <= MAX_ESTIMATION_GAP_MS) {
        const speed = input.previous?.groundSpeed?.value ?? 0;
        const trackDeg = input.previous?.track?.value ?? null;
        const projected = projectObservedPosition(input.anchorPosition, speed, trackDeg, input.now);
        const priorUncertainty = input.anchorPosition.uncertainty ?? 1;
        const traveledNm = speed * gapMs / 3_600_000;
        const uncertainty = Number((priorUncertainty + 0.15 + traveledNm * 0.08).toFixed(3));
        const score = Math.max(20, input.anchorPosition.score - Math.ceil(gapMs / 1_000) * 5);
        position = {
          value: projected,
          observedAt: new Date(input.now).toISOString(),
          sourceClass: "ESTIMATED",
          origin: null,
          source: "ESTIMATED",
          protocol: rejectedTransition ? "handover-rejected-dead-reckoning" : "dead-reckoning",
          score,
          confidence: confidenceFromScore(score),
          ageMs: gapMs,
          uncertainty,
          estimated: true,
        };
        this.estimatedGapFills += 1;
      }
    }

    const altitude = this.selectNumeric("altitude", input.local?.altitude ?? null, input.network?.altitude ?? null, input.previous?.altitude ?? null, input.now);
    const groundSpeed = this.selectNumeric("groundSpeed", input.local?.groundSpeed ?? null, input.network?.groundSpeed ?? null, input.previous?.groundSpeed ?? null, input.now);
    const track = this.selectNumeric("track", input.local?.track ?? null, input.network?.track ?? null, input.previous?.track ?? null, input.now);
    const verticalRate = this.selectNumeric("verticalRate", input.local?.verticalRate ?? null, input.network?.verticalRate ?? null, input.previous?.verticalRate ?? null, input.now);

    if (position) this.fieldSelections.position[sourceKey(position.sourceClass)] += 1;

    let canonicalPositionResidualNm: number | null = null;
    if (position && input.canonical?.lat !== null && input.canonical?.lon !== null
      && input.canonical?.lat !== undefined && input.canonical?.lon !== undefined) {
      canonicalPositionResidualNm = residualNm(position.value, { lat: input.canonical.lat, lon: input.canonical.lon });
      this.canonicalPositionComparisons += 1;
      this.recordResidual(this.canonicalResidual, canonicalPositionResidualNm);
      if (canonicalPositionResidualNm >= CANONICAL_DIVERGENCE_NM) this.canonicalPositionDivergences += 1;
    }

    return {
      version: TRACK_FUSION_SHADOW_VERSION,
      icaoHex: input.hex,
      evaluatedAt: new Date(input.now).toISOString(),
      quality: trackQuality(position),
      position,
      altitude,
      groundSpeed,
      track,
      verticalRate,
      overlap: Boolean(input.local && input.network),
      positionResidualNm: positionResidualNm === null ? null : Number(positionResidualNm.toFixed(3)),
      canonicalPositionResidualNm: canonicalPositionResidualNm === null ? null : Number(canonicalPositionResidualNm.toFixed(3)),
    };
  }

  private selectNumeric(
    field: Exclude<TrackFusionFieldName, "position">,
    local: TrackFusionFieldCandidate<number> | null,
    network: TrackFusionFieldCandidate<number> | null,
    previous: TrackFusionFieldEstimate<number> | null,
    now: number,
  ): TrackFusionFieldEstimate<number> | null {
    const candidate = bestCandidate([local, network]);
    const result = candidate
      ? estimateFromCandidate(candidate, fieldUncertainty(field, candidate))
      : holdNumeric(previous, now);
    if (result) this.fieldSelections[field][sourceKey(result.sourceClass)] += 1;
    return result;
  }

  private recordResidual(target: ResidualAccumulator, residual: number): void {
    if (!Number.isFinite(residual) || residual < 0) return;
    target.count += 1;
    target.sum += residual;
    target.maximum = Math.max(target.maximum, residual);
    const bucket = RESIDUAL_BUCKETS.findIndex((limit) => residual <= limit);
    target.buckets[bucket < 0 ? target.buckets.length - 1 : bucket] += 1;
  }

  private residualSummary(
    target: ResidualAccumulator,
    withP95: boolean,
  ): TrackFusionShadowDiagnostics["positionResidualNm"] {
    const histogram = RESIDUAL_BUCKETS.map((upperBoundNm, index) => ({
      upperBoundNm: Number.isFinite(upperBoundNm) ? upperBoundNm : null,
      count: target.buckets[index] ?? 0,
    }));
    if (!target.count) return { average: null, maximum: null, p95UpperBound: null, histogram };
    const base = {
      average: Number((target.sum / target.count).toFixed(3)),
      maximum: Number(target.maximum.toFixed(3)),
      histogram,
    };
    if (!withP95) return { ...base, p95UpperBound: null };
    const targetCount = Math.ceil(target.count * 0.95);
    let cumulative = 0;
    let upper: number | null = null;
    for (let index = 0; index < target.buckets.length; index += 1) {
      cumulative += target.buckets[index]!;
      if (cumulative >= targetCount) {
        const value = RESIDUAL_BUCKETS[index]!;
        upper = Number.isFinite(value) ? value : target.maximum;
        break;
      }
    }
    return { ...base, p95UpperBound: upper === null ? null : Number(upper.toFixed(3)) };
  }

  private pushDisagreement(value: TrackFusionRecentDisagreement): void {
    this.recentDisagreements.push(value);
    if (this.recentDisagreements.length > MAX_RECENT_DISAGREEMENTS) {
      this.recentDisagreements = this.recentDisagreements.slice(-MAX_RECENT_DISAGREEMENTS);
    }
  }
}
