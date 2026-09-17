import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import type {
  DynamicRoutePrecision,
  DynamicRouteState,
  InterpretedRoute,
  InterpretedRouteElement,
  InterpretedRoutePoint,
  RouteAdherence,
  RouteCoordinate,
  RoutePhase,
} from "./contracts";

const KM_PER_NM = 1.852;
const EARTH_RADIUS_KM = 6371;

/** Explicit, stable display thresholds. They are not flight-plan violation limits. */
export const DYNAMIC_ROUTE_THRESHOLDS_NM = {
  onRoute: 2,
  nearRoute: 10,
} as const;

export const DYNAMIC_ROUTE_HEADING_TOLERANCE_DEG = 75;
const MAX_FORWARD_JUMP_ELEMENTS = 1;
const PROCEDURE_MATCH_MIN_LEGS = 2;

export interface DynamicAircraftObservation {
  lat: number | null;
  lon: number | null;
  track?: number | null;
  altitude?: number | null;
}

export interface RouteAirportContext {
  /** Required by observed SID/STAR matching; no airport is guessed. */
  airportIcao?: string | null;
  departureAirportIcao?: string | null;
  arrivalAirportIcao?: string | null;
  departureAirport?: RouteCoordinate | null;
  arrivalAirport?: RouteCoordinate | null;
}

export interface DynamicRouteInput {
  route: InterpretedRoute;
  aircraft?: DynamicAircraftObservation;
  position?: DynamicAircraftObservation | null;
  /** Alias retained for callers that use the static engine's terminology. */
  aircraftPosition?: Pick<DynamicAircraftObservation, "lat" | "lon"> | null;
  track?: number | null;
  altitude?: number | null;
  previousState?: DynamicRouteState | null;
  airportContext?: RouteAirportContext | null;
}

export interface ObservedProcedureInput {
  route: InterpretedRoute;
  procedureType: "SID" | "STAR";
  observations: DynamicAircraftObservation[];
  airportIcao?: string | null;
}

export interface ObservedProcedureMatch {
  status: "MATCHED" | "REJECTED" | "UNRESOLVED";
  procedureId: string | null;
  procedureType: "SID" | "STAR";
  consecutiveLegs: number;
  matchedElementIds: string[];
  confidence: "HIGH" | "MEDIUM" | null;
  reason: string | null;
}

interface GeoSegment {
  from: RouteCoordinate;
  to: RouteCoordinate;
  startDistanceNm: number;
  lengthNm: number;
  bearingDeg: number;
}

interface ElementGeometry {
  element: InterpretedRouteElement;
  index: number;
  segments: GeoSegment[];
  lengthNm: number;
}

interface Projection {
  distanceNm: number;
  crossTrackNm: number;
  alongTrackNm: number;
  fraction: number;
  bearingDeg: number;
}

interface Candidate extends Projection {
  geometry: ElementGeometry;
  headingDifferenceDeg: number | null;
  headingCompatible: boolean | null;
  score: number;
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function validCoordinate(value: RouteCoordinate | null | undefined): value is RouteCoordinate {
  if (!value || !finite(value.lat) || !finite(value.lon)) return false;
  return value.lat >= -90
    && value.lat <= 90
    && value.lon >= -180
    && value.lon <= 180;
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angleDifference(left: number, right: number): number {
  return Math.abs(((normalizeDegrees(left - right) + 180) % 360) - 180);
}

function distanceNm(from: RouteCoordinate, to: RouteCoordinate): number {
  return haversineDistanceKm(from.lat, from.lon, to.lat, to.lon) / KM_PER_NM;
}

function pointCoordinate(point: InterpretedRoutePoint | null): RouteCoordinate | null {
  return point?.coordinates && validCoordinate(point.coordinates) ? point.coordinates : null;
}

function elementCoordinates(element: InterpretedRouteElement): RouteCoordinate[] {
  const geometry = element.geometry?.coordinates.filter(validCoordinate) ?? [];
  if (geometry.length >= 2) return geometry;
  const endpoints = [pointCoordinate(element.from), pointCoordinate(element.to)].filter(validCoordinate);
  return endpoints.length >= 2 ? endpoints : [];
}

function buildElementGeometry(element: InterpretedRouteElement, index: number): ElementGeometry | null {
  if (element.status !== "RESOLVED") return null;
  const coordinates = elementCoordinates(element);
  if (coordinates.length < 2) return null;
  let startDistanceNm = 0;
  const segments: GeoSegment[] = [];
  for (let i = 1; i < coordinates.length; i += 1) {
    const from = coordinates[i - 1]!;
    const to = coordinates[i]!;
    const lengthNm = distanceNm(from, to);
    if (lengthNm <= 0) continue;
    segments.push({ from, to, startDistanceNm, lengthNm, bearingDeg: initialBearing(from.lat, from.lon, to.lat, to.lon) });
    startDistanceNm += lengthNm;
  }
  return segments.length ? { element, index, segments, lengthNm: startDistanceNm } : null;
}

function geometries(route: InterpretedRoute): Array<ElementGeometry> {
  return [...route.elements].sort((left, right) => left.sequence - right.sequence)
    .map((element, index) => buildElementGeometry(element, index))
    .filter((item): item is ElementGeometry => item !== null);
}

/** Great-circle projection with a signed along-track distance. */
function projectOnSegment(point: RouteCoordinate, segment: GeoSegment): Projection {
  const startToPointNm = distanceNm(segment.from, point);
  const startBearing = initialBearing(segment.from.lat, segment.from.lon, segment.to.lat, segment.to.lon) * Math.PI / 180;
  const pointBearing = initialBearing(segment.from.lat, segment.from.lon, point.lat, point.lon) * Math.PI / 180;
  const angularStartPoint = startToPointNm * KM_PER_NM / EARTH_RADIUS_KM;
  const bearingDelta = pointBearing - startBearing;
  const crossTrackAngular = Math.asin(Math.max(-1, Math.min(1, Math.sin(angularStartPoint) * Math.sin(bearingDelta))));
  const alongAngular = Math.atan2(
    Math.sin(angularStartPoint) * Math.cos(bearingDelta),
    Math.cos(angularStartPoint),
  );
  const alongNm = alongAngular * EARTH_RADIUS_KM / KM_PER_NM;
  const fraction = alongNm / segment.lengthNm;
  const endpointDistanceNm = fraction < 0
    ? startToPointNm
    : fraction > 1 ? distanceNm(segment.to, point) : Math.abs(crossTrackAngular * EARTH_RADIUS_KM / KM_PER_NM);
  return {
    distanceNm: endpointDistanceNm,
    crossTrackNm: Math.abs(crossTrackAngular * EARTH_RADIUS_KM / KM_PER_NM),
    alongTrackNm: segment.startDistanceNm + alongNm,
    fraction: (segment.startDistanceNm + alongNm) / (segment.startDistanceNm + segment.lengthNm),
    bearingDeg: segment.bearingDeg,
  };
}

function project(point: RouteCoordinate, geometry: ElementGeometry): Projection {
  return geometry.segments
    .map((segment) => projectOnSegment(point, segment))
    .sort((left, right) => left.distanceNm - right.distanceNm)[0]!;
}

function candidateFor(point: RouteCoordinate, track: number | null, geometry: ElementGeometry): Candidate {
  const projection = project(point, geometry);
  const headingDifferenceDeg = finite(track) ? angleDifference(track, projection.bearingDeg) : null;
  const headingCompatible = headingDifferenceDeg === null ? null : headingDifferenceDeg <= DYNAMIC_ROUTE_HEADING_TOLERANCE_DEG;
  const headingPenalty = headingDifferenceDeg === null ? 0 : headingCompatible ? 0 : Math.min(12, headingDifferenceDeg / 15);
  return { ...projection, geometry, headingDifferenceDeg, headingCompatible, score: projection.distanceNm + headingPenalty };
}

function previousIndex(route: InterpretedRoute, state: DynamicRouteState | null | undefined): number | null {
  if (!state) return null;
  const elements = [...route.elements].sort((left, right) => left.sequence - right.sequence);
  const current = state.currentElement?.id;
  const index = current ? elements.findIndex((element) => element.id === current) : -1;
  if (index >= 0) return index;
  const completed = new Set(state.completedElements);
  const completedIndexes = elements.map((element, i) => completed.has(element.id) ? i : -1).filter((i) => i >= 0);
  return completedIndexes.length ? Math.max(...completedIndexes) : null;
}

function orderAllowed(index: number, prior: number | null): boolean {
  if (prior === null) return true;
  return index >= Math.max(0, prior - 1) && index <= prior + MAX_FORWARD_JUMP_ELEMENTS;
}

function hasUsablePosition(observation: DynamicAircraftObservation): observation is DynamicAircraftObservation & { lat: number; lon: number } {
  return finite(observation.lat) && finite(observation.lon)
    && observation.lat >= -90 && observation.lat <= 90
    && observation.lon >= -180 && observation.lon <= 180;
}

function candidateChoice(
  route: InterpretedRoute,
  observation: DynamicAircraftObservation,
  previousState: DynamicRouteState | null | undefined,
): { candidate: Candidate | null; ambiguous: boolean } {
  if (!hasUsablePosition(observation)) return { candidate: null, ambiguous: false };
  const point = { lat: observation.lat, lon: observation.lon };
  const prior = previousIndex(route, previousState);
  const candidates = geometries(route)
    .filter((geometry) => orderAllowed(geometry.index, prior))
    .map((geometry) => candidateFor(point, finite(observation.track) ? observation.track : null, geometry))
    .sort((left, right) => left.score - right.score);
  const best = candidates[0];
  const second = candidates[1];
  const ambiguous = Boolean(best && second
    && Math.abs(best.score - second.score) < 0.25
    && (prior === null || best.geometry.index !== second.geometry.index));
  return { candidate: best ?? null, ambiguous };
}

function pointFromElement(element: InterpretedRouteElement, side: "from" | "to"): InterpretedRoutePoint | null {
  return side === "from" ? element.from : element.to;
}

function phaseFor(
  candidate: Candidate,
  observation: DynamicAircraftObservation,
  airportContext: RouteAirportContext | null | undefined,
  routeLength: number,
): RoutePhase {
  const explicit = candidate.geometry.element.phase;
  if (explicit !== "UNKNOWN" && explicit !== "CONNECTOR") return explicit === "EN_ROUTE" ? "ENROUTE" : explicit;
  if (candidate.geometry.element.kind === "PUBLISHED_SID") return "SID";
  if (candidate.geometry.element.kind === "PUBLISHED_STAR") return "STAR";
  const departureDistance = airportContext?.departureAirport && hasUsablePosition(observation)
    ? distanceNm(airportContext.departureAirport, { lat: observation.lat, lon: observation.lon }) : null;
  const arrivalDistance = airportContext?.arrivalAirport && hasUsablePosition(observation)
    ? distanceNm(airportContext.arrivalAirport, { lat: observation.lat, lon: observation.lon }) : null;
  if (candidate.geometry.index === 0 && departureDistance !== null && departureDistance <= 5 && (!finite(observation.altitude) || observation.altitude <= 10_000)) return "DEPARTURE";
  if (candidate.geometry.index === routeLength - 1 && arrivalDistance !== null && arrivalDistance <= 5 && (!finite(observation.altitude) || observation.altitude <= 10_000)) return "ARRIVAL";
  if (["PUBLISHED_ATS", "FILED_DCT", "FILED_ROUTE", "SCHEMATIC"].includes(candidate.geometry.element.kind)) return "ENROUTE";
  return "UNKNOWN";
}

function adherence(distance: number | null): RouteAdherence {
  if (distance === null || !Number.isFinite(distance)) return "UNKNOWN";
  if (distance <= DYNAMIC_ROUTE_THRESHOLDS_NM.onRoute) return "ON_ROUTE";
  if (distance <= DYNAMIC_ROUTE_THRESHOLDS_NM.nearRoute) return "NEAR_ROUTE";
  return "OFF_ROUTE";
}

function pointDistance(point: InterpretedRoutePoint | null, position: DynamicAircraftObservation): number | null {
  const coordinate = pointCoordinate(point);
  return coordinate && hasUsablePosition(position) ? distanceNm(coordinate, { lat: position.lat, lon: position.lon }) : null;
}

function progressFor(
  route: InterpretedRoute,
  geometrical: Array<ElementGeometry>,
  candidate: Candidate | null,
): { value: number | null; percent: number | null; precision: DynamicRoutePrecision } {
  if (!candidate) return { value: null, percent: null, precision: "UNAVAILABLE" };
  const knownByIndex = new Map(geometrical.map((geometry) => [geometry.index, geometry]));
  const hasGaps = route.elements.some((element, index) => element.status !== "RESOLVED" || !knownByIndex.has(index));
  let value: number;
  if (!hasGaps) {
    const total = geometrical.reduce((sum, geometry) => sum + geometry.lengthNm, 0);
    const before = geometrical.filter((geometry) => geometry.index < candidate.geometry.index).reduce((sum, geometry) => sum + geometry.lengthNm, 0);
    value = total > 0 ? (before + Math.max(0, Math.min(candidate.geometry.lengthNm, candidate.alongTrackNm))) / total : NaN;
  } else {
    const fraction = candidate.geometry.lengthNm > 0 ? Math.max(0, Math.min(1, candidate.alongTrackNm / candidate.geometry.lengthNm)) : 0;
    value = (candidate.geometry.index + fraction) / Math.max(1, route.elements.length);
  }
  if (!Number.isFinite(value)) return { value: null, percent: null, precision: "UNAVAILABLE" };
  const bounded = Math.max(0, Math.min(1, value));
  return { value: bounded, percent: bounded * 100, precision: hasGaps ? "ESTIMATED" : "PRECISE" };
}

function emptyState(route: InterpretedRoute, precision: DynamicRoutePrecision = "UNAVAILABLE"): DynamicRouteState {
  const elements = [...route.elements].sort((left, right) => left.sequence - right.sequence);
  return {
    currentPhase: "UNKNOWN",
    currentElement: null,
    previousPoint: null,
    nextPoint: null,
    distanceToNext: null,
    crossTrackDeviation: null,
    alongTrackDistance: null,
    routeAdherence: "UNKNOWN",
    completedElements: [],
    remainingElements: elements.map((element) => element.id),
    routeProgress: null,
    routeProgressPercent: null,
    precision,
    progressPrecision: "UNAVAILABLE",
  };
}

/**
 * Analyze one aircraft observation against an ordered interpreted route.
 * Ordering and the prior state constrain the candidate set before geometry is
 * scored, which is important at route crossings and close parallel legs.
 */
export function analyzeDynamicRoute(input: DynamicRouteInput): DynamicRouteState {
  const orderedRoute: InterpretedRoute = {
    ...input.route,
    elements: [...input.route.elements].sort((left, right) => left.sequence - right.sequence),
  };
  const aircraft = {
    lat: null,
    lon: null,
    ...(input.aircraft ?? {}),
    ...(input.position ?? {}),
    ...(input.aircraftPosition ? { lat: input.aircraftPosition.lat, lon: input.aircraftPosition.lon } : {}),
    ...(input.track !== undefined ? { track: input.track } : {}),
    ...(input.altitude !== undefined ? { altitude: input.altitude } : {}),
  };
  if (!hasUsablePosition(aircraft)) return emptyState(orderedRoute);
  const routeGeometries = geometries(orderedRoute);
  if (!routeGeometries.length) return emptyState(orderedRoute, "UNAVAILABLE");
  const choice = candidateChoice(orderedRoute, aircraft, input.previousState);
  if (!choice.candidate || choice.ambiguous) {
    const bestDistance = choice.candidate?.distanceNm ?? null;
    const state = emptyState(orderedRoute, orderedRoute.elements.length > routeGeometries.length ? "PARTIAL" : "UNAVAILABLE");
    return { ...state, routeAdherence: adherence(bestDistance), precision: state.precision };
  }
  const candidate = choice.candidate;
  const element = candidate.geometry.element;
  const index = candidate.geometry.index;
  const progress = progressFor(orderedRoute, routeGeometries, candidate);
  const completedElements = orderedRoute.elements.slice(0, index)
    .filter((item) => item.status === "RESOLVED")
    .map((item) => item.id);
  const completedSet = new Set(completedElements);
  const remainingElements = orderedRoute.elements
    .filter((item) => item.id !== element.id && !completedSet.has(item.id))
    .map((item) => item.id);
  const previousPoint = pointFromElement(element, "from");
  const nextPoint = pointFromElement(element, "to");
  const geometryPrecision: DynamicRoutePrecision = input.route.elements.length === routeGeometries.length ? "PRECISE" : "PARTIAL";
  return {
    currentPhase: phaseFor(candidate, aircraft, input.airportContext, orderedRoute.elements.length),
    currentElement: element,
    previousPoint,
    nextPoint,
    distanceToNext: pointDistance(nextPoint, aircraft),
    crossTrackDeviation: candidate.crossTrackNm,
    alongTrackDistance: candidate.alongTrackNm,
    routeAdherence: adherence(candidate.distanceNm),
    completedElements,
    remainingElements,
    routeProgress: progress.value,
    routeProgressPercent: progress.percent,
    precision: geometryPrecision === "PARTIAL" ? "PARTIAL" : progress.precision,
    progressPrecision: progress.precision,
  };
}

function procedureElements(route: InterpretedRoute, type: "SID" | "STAR"): Array<ElementGeometry> {
  return geometries(route).filter((geometry) => geometry.element.kind === `PUBLISHED_${type}` && geometry.element.phase === type);
}

function procedureAirportMatches(route: InterpretedRoute, type: "SID" | "STAR", airportIcao: string): boolean {
  const matches = route.procedureMatches.filter((match) => {
    const candidate = match.candidates.find((item) => item.procedureId === match.selectedProcedureId)
      ?? match.candidates[0];
    return candidate?.type === type && normalized(candidate.airportIcao) === normalized(airportIcao);
  });
  return matches.length > 0;
}

/**
 * Conservative observed procedure confirmation. A single pass never matches:
 * two distinct consecutive published legs, correct direction, and airport
 * context are all required.
 */
export function matchObservedProcedure(input: ObservedProcedureInput): ObservedProcedureMatch {
  const base: Omit<ObservedProcedureMatch, "status" | "reason"> = {
    procedureId: null,
    procedureType: input.procedureType,
    consecutiveLegs: 0,
    matchedElementIds: [],
    confidence: null,
  };
  const airport = input.airportIcao?.trim() ?? "";
  if (!airport) return { ...base, status: "UNRESOLVED", reason: "airport context is required" };
  if (!procedureAirportMatches(input.route, input.procedureType, airport)) return { ...base, status: "REJECTED", reason: "route procedure airport context does not match" };
  const procedure = procedureElements(input.route, input.procedureType);
  if (procedure.length < PROCEDURE_MATCH_MIN_LEGS) return { ...base, status: "UNRESOLVED", reason: "fewer than two resolved procedure legs" };
  const usableObservations = input.observations.filter(hasUsablePosition);
  for (let start = 0; start <= procedure.length - PROCEDURE_MATCH_MIN_LEGS; start += 1) {
    let nextLeg = start;
    const matched: string[] = [];
    for (const observation of usableObservations) {
      const geometry = procedure[nextLeg];
      if (!geometry) break;
      const candidate = candidateFor({ lat: observation.lat, lon: observation.lon }, finite(observation.track) ? observation.track : null, geometry);
      const withinLeg = candidate.alongTrackNm >= -Math.max(2, geometry.lengthNm * 0.2)
        && candidate.alongTrackNm <= geometry.lengthNm + Math.max(2, geometry.lengthNm * 0.2);
      if (candidate.distanceNm > DYNAMIC_ROUTE_THRESHOLDS_NM.nearRoute || !withinLeg || candidate.headingCompatible === false) break;
      if (!matched.includes(geometry.element.id)) matched.push(geometry.element.id);
      if (candidate.alongTrackNm > geometry.lengthNm * 0.7 && nextLeg < procedure.length - 1) nextLeg += 1;
    }
    if (matched.length >= PROCEDURE_MATCH_MIN_LEGS) {
      const procedureId = matched.map((id) => input.route.elements.find((element) => element.id === id)?.source.procedureId).find(Boolean) ?? null;
      return { ...base, status: "MATCHED", procedureId, consecutiveLegs: matched.length, matchedElementIds: matched, confidence: matched.length >= 3 ? "HIGH" : "MEDIUM", reason: null };
    }
  }
  return { ...base, status: "REJECTED", reason: "ordered directional evidence did not cover two consecutive legs" };
}

export const analyzeDynamicRouteState = analyzeDynamicRoute;
export const deriveDynamicRouteState = analyzeDynamicRoute;
export const computeDynamicRouteState = analyzeDynamicRoute;
export const analyzeRouteDynamics = analyzeDynamicRoute;
