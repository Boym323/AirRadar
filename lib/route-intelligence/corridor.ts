import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import type { RouteCoordinate, RouteIntelligenceV2Snapshot } from "./contracts";

const KM_PER_NM = 1.852;

export const ROUTE_CORRIDOR_THRESHOLDS_NM = {
  onRoute: 2,
  deviation: 10,
} as const;

export const ROUTE_CORRIDOR_CONFIRMATION = {
  deviationSamples: 3,
  deviationMs: 10_000,
  recoverySamples: 2,
  recoveryMs: 5_000,
} as const;

export type RouteCorridorStatus = "ON_ROUTE" | "OFFSET" | "DEVIATING" | "ROUTE_UNKNOWN";
export type RouteCorridorConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface RouteCorridorTrackerState {
  routeId: string;
  lastObservedAt: number | null;
  status: RouteCorridorStatus;
  offRouteSamples: number;
  offRouteSince: number | null;
  recoverySamples: number;
  recoverySince: number | null;
}

export interface RouteCorridorObservation {
  observedAt: number;
  lat: number | null;
  lon: number | null;
  trackDeg: number | null;
  groundSpeedKt: number | null;
}

export interface RouteCorridorSnapshot {
  status: RouteCorridorStatus;
  confidence: RouteCorridorConfidence;
  progressPercent: number | null;
  nextPoint: { id: string; name: string } | null;
  distanceToNextNm: number | null;
  remainingDistanceNm: number | null;
  remainingDistanceComplete: boolean;
  etaToNextMinutes: number | null;
  etaRemainingMinutes: number | null;
  crossTrackDeviationNm: number | null;
  expectedTrackDeg: number | null;
  trackDeltaDeg: number | null;
  currentElementId: string | null;
  resolvedElements: number;
  totalElements: number;
  reconstructionCoveragePercent: number | null;
  precision: RouteIntelligenceV2Snapshot["dynamic"]["precision"];
}

export interface RouteCorridorResult {
  snapshot: RouteCorridorSnapshot;
  tracker: RouteCorridorTrackerState;
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

function distanceNm(left: RouteCoordinate, right: RouteCoordinate): number {
  return haversineDistanceKm(left.lat, left.lon, right.lat, right.lon) / KM_PER_NM;
}

function elementCoordinates(element: RouteIntelligenceV2Snapshot["route"]["elements"][number]): RouteCoordinate[] {
  const geometry = element.geometry?.coordinates.filter(validCoordinate) ?? [];
  if (geometry.length >= 2) return geometry;
  const endpoints = [element.from?.coordinates, element.to?.coordinates].filter(validCoordinate);
  return endpoints.length >= 2 ? endpoints : [];
}

function elementLengthNm(element: RouteIntelligenceV2Snapshot["route"]["elements"][number]): number | null {
  const points = elementCoordinates(element);
  if (points.length < 2) return null;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distanceNm(points[index - 1]!, points[index]!);
  return total > 0 ? total : null;
}

function normalizedDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angleDifference(left: number, right: number): number {
  return Math.abs(((normalizedDegrees(left - right) + 180) % 360) - 180);
}

function expectedTrack(
  snapshot: RouteIntelligenceV2Snapshot,
): number | null {
  const current = snapshot.dynamic.currentElement;
  if (!current) return null;
  const points = elementCoordinates(current);
  if (points.length < 2) return null;
  const targetAlong = Math.max(0, snapshot.dynamic.alongTrackDistance ?? 0);
  let traversed = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = distanceNm(from, to);
    if (targetAlong <= traversed + length || index === points.length - 1) {
      return initialBearing(from.lat, from.lon, to.lat, to.lon);
    }
    traversed += length;
  }
  return null;
}

function remainingDistance(
  snapshot: RouteIntelligenceV2Snapshot,
): { distance: number | null; complete: boolean } {
  const currentId = snapshot.dynamic.currentElement?.id ?? null;
  if (!currentId) return { distance: null, complete: false };
  const ordered = [...snapshot.route.elements].sort((left, right) => left.sequence - right.sequence);
  const currentIndex = ordered.findIndex((element) => element.id === currentId);
  if (currentIndex < 0) return { distance: null, complete: false };

  let total = 0;
  let complete = true;
  for (let index = currentIndex; index < ordered.length; index += 1) {
    const element = ordered[index]!;
    const length = elementLengthNm(element);
    if (element.status !== "RESOLVED" || length === null) {
      complete = false;
      continue;
    }
    if (index === currentIndex) {
      const along = Math.max(0, Math.min(length, snapshot.dynamic.alongTrackDistance ?? 0));
      total += Math.max(0, length - along);
    } else {
      total += length;
    }
  }
  return { distance: total > 0 ? total : 0, complete };
}

function etaMinutes(distance: number | null, speedKt: number | null): number | null {
  if (!finite(distance) || !finite(speedKt) || speedKt < 40 || distance < 0) return null;
  return (distance / speedKt) * 60;
}

function confidence(snapshot: RouteIntelligenceV2Snapshot): RouteCorridorConfidence {
  const coverage = snapshot.route.coverage.reconstruction.percent ?? 0;
  if (coverage >= 80 && (snapshot.dynamic.precision === "PRECISE" || snapshot.dynamic.precision === "PARTIAL")) return "HIGH";
  if (coverage >= 50 || snapshot.dynamic.currentElement) return "MEDIUM";
  return "LOW";
}

function emptyTracker(routeId: string): RouteCorridorTrackerState {
  return {
    routeId,
    lastObservedAt: null,
    status: "ROUTE_UNKNOWN",
    offRouteSamples: 0,
    offRouteSince: null,
    recoverySamples: 0,
    recoverySince: null,
  };
}

function corridorStatus(
  snapshot: RouteIntelligenceV2Snapshot,
  observation: RouteCorridorObservation,
  previous: RouteCorridorTrackerState | null | undefined,
): RouteCorridorTrackerState {
  const routeId = snapshot.route.id;
  const base = previous?.routeId === routeId ? previous : emptyTracker(routeId);
  if (!Number.isFinite(observation.observedAt) || base.lastObservedAt === observation.observedAt) return base;

  const deviation = snapshot.dynamic.crossTrackDeviation;
  if (!snapshot.dynamic.currentElement || !finite(deviation)) {
    return { ...emptyTracker(routeId), lastObservedAt: observation.observedAt };
  }

  if (deviation > ROUTE_CORRIDOR_THRESHOLDS_NM.deviation) {
    const offRouteSince = base.offRouteSince ?? observation.observedAt;
    const offRouteSamples = base.offRouteSamples + 1;
    const confirmed = offRouteSamples >= ROUTE_CORRIDOR_CONFIRMATION.deviationSamples
      && observation.observedAt - offRouteSince >= ROUTE_CORRIDOR_CONFIRMATION.deviationMs;
    return {
      routeId,
      lastObservedAt: observation.observedAt,
      status: confirmed ? "DEVIATING" : "OFFSET",
      offRouteSamples,
      offRouteSince,
      recoverySamples: 0,
      recoverySince: null,
    };
  }

  if (base.status === "DEVIATING") {
    const recoverySince = base.recoverySince ?? observation.observedAt;
    const recoverySamples = base.recoverySamples + 1;
    const recovered = recoverySamples >= ROUTE_CORRIDOR_CONFIRMATION.recoverySamples
      && observation.observedAt - recoverySince >= ROUTE_CORRIDOR_CONFIRMATION.recoveryMs;
    if (!recovered) {
      return {
        ...base,
        lastObservedAt: observation.observedAt,
        recoverySamples,
        recoverySince,
      };
    }
  }

  return {
    routeId,
    lastObservedAt: observation.observedAt,
    status: deviation <= ROUTE_CORRIDOR_THRESHOLDS_NM.onRoute ? "ON_ROUTE" : "OFFSET",
    offRouteSamples: 0,
    offRouteSince: null,
    recoverySamples: 0,
    recoverySince: null,
  };
}

/**
 * Derive bounded, display-oriented route-corridor intelligence from the
 * existing Route Intelligence V2 snapshot. No I/O or persistence occurs here.
 *
 * The DEVIATING state is intentionally hysteretic: a single off-route sample
 * is only OFFSET. Three distinct observations spanning at least 10 seconds are
 * required before DEVIATING is published; recovery is also confirmed.
 */
export function buildRouteCorridorIntelligence(
  route: RouteIntelligenceV2Snapshot,
  observation: RouteCorridorObservation,
  previousTracker?: RouteCorridorTrackerState | null,
): RouteCorridorResult {
  const tracker = corridorStatus(route, observation, previousTracker);
  const remaining = remainingDistance(route);
  const expectedTrackDeg = expectedTrack(route);
  const trackDeltaDeg = finite(observation.trackDeg) && finite(expectedTrackDeg)
    ? angleDifference(observation.trackDeg, expectedTrackDeg)
    : null;
  const resolvedElements = route.route.elements.filter((element) => element.status === "RESOLVED" && elementLengthNm(element) !== null).length;
  const totalElements = route.route.elements.length;
  return {
    tracker,
    snapshot: {
      status: tracker.status,
      confidence: confidence(route),
      progressPercent: route.dynamic.routeProgressPercent,
      nextPoint: route.dynamic.nextPoint ? { id: route.dynamic.nextPoint.id, name: route.dynamic.nextPoint.name } : null,
      distanceToNextNm: route.dynamic.distanceToNext,
      remainingDistanceNm: remaining.distance,
      remainingDistanceComplete: remaining.complete,
      etaToNextMinutes: etaMinutes(route.dynamic.distanceToNext, observation.groundSpeedKt),
      etaRemainingMinutes: etaMinutes(remaining.distance, observation.groundSpeedKt),
      crossTrackDeviationNm: route.dynamic.crossTrackDeviation,
      expectedTrackDeg,
      trackDeltaDeg,
      currentElementId: route.dynamic.currentElement?.id ?? null,
      resolvedElements,
      totalElements,
      reconstructionCoveragePercent: route.route.coverage.reconstruction.percent,
      precision: route.dynamic.precision,
    },
  };
}
