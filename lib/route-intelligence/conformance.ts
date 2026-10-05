import { haversineDistanceKm } from "@/lib/geo";
import type { RouteCorridorSnapshot } from "./corridor";
import type { InterpretedRouteElement, RouteCoordinate, RouteIntelligenceV2Snapshot } from "./contracts";

const KM_PER_NM = 1.852;

export const TRAJECTORY_CONFORMANCE_THRESHOLDS = {
  minimumCoveragePercent: 50,
  directMinimumSkippedElements: 2,
  directMinimumSkippedDistanceNm: 10,
  offsetDirectMinimumSkippedElements: 3,
  offsetDirectMinimumSkippedDistanceNm: 20,
  rejoinSamples: 2,
  rejoinMs: 5_000,
  probableDirectHoldMs: 30_000,
} as const;

export type TrajectoryConformanceStatus =
  | "ROUTE_UNKNOWN"
  | "ROUTE_UNCERTAIN"
  | "ON_ROUTE"
  | "OFFSET"
  | "DEVIATING"
  | "REJOINING"
  | "PROBABLE_DIRECT";

export type TrajectoryConformanceConfidence = "HIGH" | "MEDIUM" | "LOW";

export type TrajectoryConformanceEvidence =
  | "ROUTE_COVERAGE_LOW"
  | "CURRENT_ELEMENT_MISSING"
  | "CORRIDOR_ON_ROUTE"
  | "CORRIDOR_OFFSET"
  | "CORRIDOR_DEVIATING"
  | "REJOIN_CANDIDATE"
  | "REJOIN_CONFIRMED"
  | "FORWARD_ELEMENT_JUMP"
  | "SKIPPED_RESOLVED_ELEMENTS"
  | "SKIPPED_DISTANCE"
  | "PRIOR_DEVIATION"
  | "PRIOR_OFFSET"
  | "TRACK_DIVERGENCE"
  | "DIRECT_HOLD";

export interface TrajectoryConformanceCounters {
  observations: number;
  deviationTransitions: number;
  rejoinCandidates: number;
  rejoinConfirmed: number;
  directCandidates: number;
  probableDirects: number;
  rejectedJumpCandidates: number;
  routeUncertainObservations: number;
}

export interface ProbableDirectEvidence {
  fromElementId: string;
  fromLabel: string | null;
  toElementId: string;
  toLabel: string | null;
  rejoinedAt: string | null;
  skippedElementIds: string[];
  skippedElements: number;
  skippedDistanceNm: number | null;
  detectedAt: number;
  confidence: TrajectoryConformanceConfidence;
}

export interface TrajectoryConformanceTrackerState {
  routeId: string;
  lastObservedAt: number | null;
  status: TrajectoryConformanceStatus;
  currentElementId: string | null;
  currentElementSequence: number | null;
  deviationStartedAt: number | null;
  rejoinStartedAt: number | null;
  rejoinSamples: number;
  probableDirect: ProbableDirectEvidence | null;
  directHoldUntil: number | null;
  counters: TrajectoryConformanceCounters;
}

export interface TrajectoryConformanceSnapshot {
  status: TrajectoryConformanceStatus;
  confidence: TrajectoryConformanceConfidence;
  currentElementId: string | null;
  currentElementSequence: number | null;
  deviationStartedAt: number | null;
  rejoinStartedAt: number | null;
  probableDirect: ProbableDirectEvidence | null;
  evidence: TrajectoryConformanceEvidence[];
  reconstructionCoveragePercent: number | null;
  crossTrackDeviationNm: number | null;
  trackDeltaDeg: number | null;
}

export interface TrajectoryConformanceResult {
  snapshot: TrajectoryConformanceSnapshot;
  tracker: TrajectoryConformanceTrackerState;
}

export interface TrajectoryConformanceInput {
  route: RouteIntelligenceV2Snapshot;
  corridor: RouteCorridorSnapshot;
  observedAt: number;
}

function counters(): TrajectoryConformanceCounters {
  return {
    observations: 0,
    deviationTransitions: 0,
    rejoinCandidates: 0,
    rejoinConfirmed: 0,
    directCandidates: 0,
    probableDirects: 0,
    rejectedJumpCandidates: 0,
    routeUncertainObservations: 0,
  };
}

function emptyTracker(routeId: string): TrajectoryConformanceTrackerState {
  return {
    routeId,
    lastObservedAt: null,
    status: "ROUTE_UNKNOWN",
    currentElementId: null,
    currentElementSequence: null,
    deviationStartedAt: null,
    rejoinStartedAt: null,
    rejoinSamples: 0,
    probableDirect: null,
    directHoldUntil: null,
    counters: counters(),
  };
}

function copyCounters(value: TrajectoryConformanceCounters): TrajectoryConformanceCounters {
  return { ...value };
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function validCoordinate(value: RouteCoordinate | null | undefined): value is RouteCoordinate {
  return Boolean(value)
    && finite(value?.lat)
    && finite(value?.lon)
    && value!.lat >= -90
    && value!.lat <= 90
    && value!.lon >= -180
    && value!.lon <= 180;
}

function elementCoordinates(element: InterpretedRouteElement): RouteCoordinate[] {
  const geometry = element.geometry?.coordinates.filter(validCoordinate) ?? [];
  if (geometry.length >= 2) return geometry;
  const endpoints = [element.from?.coordinates, element.to?.coordinates].filter(validCoordinate);
  return endpoints.length >= 2 ? endpoints : [];
}

function elementLengthNm(element: InterpretedRouteElement): number | null {
  const coordinates = elementCoordinates(element);
  if (coordinates.length < 2) return null;
  let lengthKm = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1]!;
    const to = coordinates[index]!;
    lengthKm += haversineDistanceKm(from.lat, from.lon, to.lat, to.lon);
  }
  return lengthKm > 0 ? lengthKm / KM_PER_NM : null;
}

function directEligible(element: InterpretedRouteElement): boolean {
  return element.status === "RESOLVED"
    && (element.phase === "EN_ROUTE" || element.phase === "ENROUTE" || element.phase === "CONNECTOR")
    && (element.kind === "PUBLISHED_ATS" || element.kind === "FILED_DCT" || element.kind === "FILED_ROUTE");
}

function orderedElements(route: RouteIntelligenceV2Snapshot): InterpretedRouteElement[] {
  return [...route.route.elements].sort((left, right) => left.sequence - right.sequence);
}

function elementSequence(route: RouteIntelligenceV2Snapshot, id: string | null): number | null {
  if (!id) return null;
  return route.route.elements.find((element) => element.id === id)?.sequence ?? null;
}

function skippedEvidence(
  route: RouteIntelligenceV2Snapshot,
  fromSequence: number | null,
  toSequence: number | null,
): { ids: string[]; count: number; distanceNm: number | null } {
  if (!finite(fromSequence) || !finite(toSequence) || toSequence <= fromSequence + 1) {
    return { ids: [], count: 0, distanceNm: 0 };
  }
  const skipped = orderedElements(route)
    .filter((element) => element.sequence > fromSequence && element.sequence < toSequence)
    .filter(directEligible);
  let distance = 0;
  let complete = true;
  for (const element of skipped) {
    const length = elementLengthNm(element);
    if (length === null) {
      complete = false;
      continue;
    }
    distance += length;
  }
  return {
    ids: skipped.map((element) => element.id),
    count: skipped.length,
    distanceNm: complete ? distance : skipped.length ? distance || null : 0,
  };
}

function confidence(input: TrajectoryConformanceInput, status: TrajectoryConformanceStatus): TrajectoryConformanceConfidence {
  const coverage = input.route.route.coverage.reconstruction.percent ?? 0;
  if (status === "ROUTE_UNKNOWN" || status === "ROUTE_UNCERTAIN") return "LOW";
  if (coverage >= 80 && input.corridor.confidence === "HIGH") return "HIGH";
  if (coverage >= 50 && input.corridor.confidence !== "LOW") return "MEDIUM";
  return "LOW";
}

function routeUncertain(input: TrajectoryConformanceInput): boolean {
  const coverage = input.route.route.coverage.reconstruction.percent ?? 0;
  return coverage < TRAJECTORY_CONFORMANCE_THRESHOLDS.minimumCoveragePercent
    || input.corridor.precision === "UNAVAILABLE";
}

function directCandidate(
  input: TrajectoryConformanceInput,
  base: TrajectoryConformanceTrackerState,
  currentSequence: number | null,
): ProbableDirectEvidence | null {
  if (!base.currentElementId || !finite(base.currentElementSequence) || !finite(currentSequence)) return null;
  if (currentSequence <= base.currentElementSequence + 1) return null;
  const skipped = skippedEvidence(input.route, base.currentElementSequence, currentSequence);
  const fromPriorDeviation = base.status === "DEVIATING" || base.status === "REJOINING";
  const fromPriorOffset = base.status === "OFFSET";
  const distance = skipped.distanceNm ?? 0;
  const qualifiesFromDeviation = fromPriorDeviation
    && skipped.count >= TRAJECTORY_CONFORMANCE_THRESHOLDS.directMinimumSkippedElements
    && distance >= TRAJECTORY_CONFORMANCE_THRESHOLDS.directMinimumSkippedDistanceNm;
  const qualifiesFromOffset = fromPriorOffset
    && skipped.count >= TRAJECTORY_CONFORMANCE_THRESHOLDS.offsetDirectMinimumSkippedElements
    && distance >= TRAJECTORY_CONFORMANCE_THRESHOLDS.offsetDirectMinimumSkippedDistanceNm;
  if (!qualifiesFromDeviation && !qualifiesFromOffset) return null;
  const current = input.route.dynamic.currentElement;
  const previousElement = input.route.route.elements.find((element) => element.id === base.currentElementId) ?? null;
  if (!current || input.corridor.status !== "ON_ROUTE") return null;
  return {
    fromElementId: base.currentElementId,
    fromLabel: previousElement?.label ?? previousElement?.to?.name ?? null,
    toElementId: current.id,
    toLabel: current.label ?? current.from?.name ?? current.to?.name ?? null,
    rejoinedAt: current.from?.name ?? current.to?.name ?? current.label ?? null,
    skippedElementIds: skipped.ids,
    skippedElements: skipped.count,
    skippedDistanceNm: skipped.distanceNm,
    detectedAt: input.observedAt,
    confidence: qualifiesFromDeviation && skipped.count >= 3 && (input.route.route.coverage.reconstruction.percent ?? 0) >= 80
      ? "HIGH"
      : "MEDIUM",
  };
}

function snapshot(
  input: TrajectoryConformanceInput,
  tracker: TrajectoryConformanceTrackerState,
  evidence: TrajectoryConformanceEvidence[],
): TrajectoryConformanceSnapshot {
  return {
    status: tracker.status,
    confidence: tracker.probableDirect?.confidence ?? confidence(input, tracker.status),
    currentElementId: tracker.currentElementId,
    currentElementSequence: tracker.currentElementSequence,
    deviationStartedAt: tracker.deviationStartedAt,
    rejoinStartedAt: tracker.rejoinStartedAt,
    probableDirect: tracker.probableDirect,
    evidence: [...new Set(evidence)],
    reconstructionCoveragePercent: input.route.route.coverage.reconstruction.percent,
    crossTrackDeviationNm: input.corridor.crossTrackDeviationNm,
    trackDeltaDeg: input.corridor.trackDeltaDeg,
  };
}

/**
 * Stateful but pure trajectory-conformance classifier.
 *
 * It consumes only Route Intelligence V2 + Route Corridor observations. It
 * performs no I/O and persists nothing. The caller owns the bounded tracker.
 */
export function buildTrajectoryConformance(
  input: TrajectoryConformanceInput,
  previous?: TrajectoryConformanceTrackerState | null,
): TrajectoryConformanceResult {
  const routeId = input.route.route.id;
  const base = previous?.routeId === routeId ? previous : emptyTracker(routeId);
  if (!Number.isFinite(input.observedAt) || input.observedAt === base.lastObservedAt) {
    return { tracker: base, snapshot: snapshot(input, base, []) };
  }

  const nextCounters = copyCounters(base.counters);
  nextCounters.observations += 1;
  const currentElementId = input.route.dynamic.currentElement?.id ?? null;
  const currentElementSequence = elementSequence(input.route, currentElementId);
  const evidence: TrajectoryConformanceEvidence[] = [];

  if (!input.route.route.elements.length || input.route.route.status === "NO_ROUTE") {
    const tracker = {
      ...emptyTracker(routeId),
      lastObservedAt: input.observedAt,
      counters: nextCounters,
    };
    return { tracker, snapshot: snapshot(input, tracker, ["CURRENT_ELEMENT_MISSING"]) };
  }

  if (routeUncertain(input) || !currentElementId || !finite(currentElementSequence)) {
    nextCounters.routeUncertainObservations += 1;
    if ((input.route.route.coverage.reconstruction.percent ?? 0) < TRAJECTORY_CONFORMANCE_THRESHOLDS.minimumCoveragePercent) evidence.push("ROUTE_COVERAGE_LOW");
    if (!currentElementId) evidence.push("CURRENT_ELEMENT_MISSING");
    const tracker: TrajectoryConformanceTrackerState = {
      ...base,
      lastObservedAt: input.observedAt,
      status: "ROUTE_UNCERTAIN",
      currentElementId,
      currentElementSequence,
      rejoinStartedAt: null,
      rejoinSamples: 0,
      counters: nextCounters,
    };
    return { tracker, snapshot: snapshot(input, tracker, evidence) };
  }

  const jumpedForward = finite(base.currentElementSequence) && currentElementSequence > base.currentElementSequence + 1;
  if (jumpedForward) {
    nextCounters.directCandidates += 1;
    evidence.push("FORWARD_ELEMENT_JUMP");
  }
  const direct = directCandidate(input, base, currentElementSequence);
  if (direct) {
    nextCounters.probableDirects += 1;
    evidence.push("SKIPPED_RESOLVED_ELEMENTS", "SKIPPED_DISTANCE");
    evidence.push(base.status === "OFFSET" ? "PRIOR_OFFSET" : "PRIOR_DEVIATION");
    const tracker: TrajectoryConformanceTrackerState = {
      ...base,
      lastObservedAt: input.observedAt,
      status: "PROBABLE_DIRECT",
      currentElementId,
      currentElementSequence,
      deviationStartedAt: null,
      rejoinStartedAt: null,
      rejoinSamples: 0,
      probableDirect: direct,
      directHoldUntil: input.observedAt + TRAJECTORY_CONFORMANCE_THRESHOLDS.probableDirectHoldMs,
      counters: nextCounters,
    };
    return { tracker, snapshot: snapshot(input, tracker, evidence) };
  }
  if (jumpedForward) nextCounters.rejectedJumpCandidates += 1;

  if (base.status === "PROBABLE_DIRECT"
    && finite(base.directHoldUntil)
    && input.observedAt < base.directHoldUntil
    && input.corridor.status === "ON_ROUTE") {
    evidence.push("DIRECT_HOLD", "CORRIDOR_ON_ROUTE");
    const tracker: TrajectoryConformanceTrackerState = {
      ...base,
      lastObservedAt: input.observedAt,
      currentElementId,
      currentElementSequence,
      counters: nextCounters,
    };
    return { tracker, snapshot: snapshot(input, tracker, evidence) };
  }

  if (input.corridor.status === "DEVIATING") {
    evidence.push("CORRIDOR_DEVIATING");
    if (finite(input.corridor.trackDeltaDeg) && input.corridor.trackDeltaDeg >= 45) evidence.push("TRACK_DIVERGENCE");
    if (base.status !== "DEVIATING") nextCounters.deviationTransitions += 1;
    const tracker: TrajectoryConformanceTrackerState = {
      ...base,
      lastObservedAt: input.observedAt,
      status: "DEVIATING",
      currentElementId,
      currentElementSequence,
      deviationStartedAt: base.status === "DEVIATING" ? base.deviationStartedAt : input.observedAt,
      rejoinStartedAt: null,
      rejoinSamples: 0,
      probableDirect: null,
      directHoldUntil: null,
      counters: nextCounters,
    };
    return { tracker, snapshot: snapshot(input, tracker, evidence) };
  }

  if (base.status === "DEVIATING" || base.status === "REJOINING") {
    if (input.corridor.status === "ON_ROUTE") {
      const rejoinStartedAt = base.status === "REJOINING" && base.rejoinStartedAt !== null
        ? base.rejoinStartedAt
        : input.observedAt;
      const rejoinSamples = base.status === "REJOINING" ? base.rejoinSamples + 1 : 1;
      if (base.status !== "REJOINING") nextCounters.rejoinCandidates += 1;
      const confirmed = rejoinSamples >= TRAJECTORY_CONFORMANCE_THRESHOLDS.rejoinSamples
        && input.observedAt - rejoinStartedAt >= TRAJECTORY_CONFORMANCE_THRESHOLDS.rejoinMs;
      evidence.push(confirmed ? "REJOIN_CONFIRMED" : "REJOIN_CANDIDATE", "CORRIDOR_ON_ROUTE");
      if (confirmed) nextCounters.rejoinConfirmed += 1;
      const tracker: TrajectoryConformanceTrackerState = {
        ...base,
        lastObservedAt: input.observedAt,
        status: confirmed ? "ON_ROUTE" : "REJOINING",
        currentElementId,
        currentElementSequence,
        deviationStartedAt: confirmed ? null : base.deviationStartedAt,
        rejoinStartedAt: confirmed ? null : rejoinStartedAt,
        rejoinSamples: confirmed ? 0 : rejoinSamples,
        probableDirect: null,
        directHoldUntil: null,
        counters: nextCounters,
      };
      return { tracker, snapshot: snapshot(input, tracker, evidence) };
    }
  }

  const mappedStatus: TrajectoryConformanceStatus = input.corridor.status === "ON_ROUTE"
    ? "ON_ROUTE"
    : input.corridor.status === "OFFSET"
      ? "OFFSET"
      : "ROUTE_UNCERTAIN";
  evidence.push(mappedStatus === "ON_ROUTE" ? "CORRIDOR_ON_ROUTE" : "CORRIDOR_OFFSET");
  const tracker: TrajectoryConformanceTrackerState = {
    ...base,
    lastObservedAt: input.observedAt,
    status: mappedStatus,
    currentElementId,
    currentElementSequence,
    deviationStartedAt: null,
    rejoinStartedAt: null,
    rejoinSamples: 0,
    probableDirect: null,
    directHoldUntil: null,
    counters: nextCounters,
  };
  return { tracker, snapshot: snapshot(input, tracker, evidence) };
}
