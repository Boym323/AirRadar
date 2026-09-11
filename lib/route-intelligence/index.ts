import type { AircraftEnrichment } from "@/lib/aircraft/types";
import type { CzAtsPoint, CzAtsRoute, CzAtsRouteDocument, CzAtsSegment } from "@/lib/ats/cz-routes";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";

export const DEFAULT_MAX_XTRACK_NM = 25;
const EARTH_RADIUS_KM = 6371;
const KM_PER_NM = 1.852;
const MAX_STATIC_CACHE_ENTRIES = 128;
const MAX_PATH_SEARCH_STEPS = 128;

export type RouteTokenType = "WAYPOINT" | "AIRWAY" | "DCT" | "UNKNOWN";

export interface RouteToken {
  type: RouteTokenType;
  value: string;
  index: number;
}

export interface AircraftRouteInput {
  route?: Pick<NonNullable<AircraftEnrichment["route"]>, "source"> | null;
  flightPlan?: Pick<NonNullable<AircraftEnrichment["flightPlan"]>, "filedRoute" | "waypoints" | "source"> | null;
  filedRoute?: string | null;
  waypoints?: string[] | null;
  source?: string | null;
}

export interface AircraftPositionInput {
  lat: number | null;
  lon: number | null;
  track?: number | null;
}

export type RouteIntelligenceNetwork = Pick<CzAtsRouteDocument, "source" | "routes">;

export interface MatchedWaypoint {
  routeToken: string;
  tokenIndex: number;
  pointId: string;
  name: string;
  latitude: number;
  longitude: number;
  confidence: "HIGH" | "MEDIUM";
}

export interface MatchedAtsSegment {
  segmentId: string;
  routeDesignator: string;
  fromName: string;
  toName: string;
  from: [number, number];
  to: [number, number];
  direction: "FORWARD" | "REVERSE";
  routeLegIndex: number;
  confidence: "HIGH" | "MEDIUM";
  crossTrackDeviationNm: number | null;
  alongTrackProgress: number | null;
  headingCompatible: boolean | null;
}

export interface RouteIntelligenceResult {
  status: "MATCHED" | "PARTIAL" | "UNRESOLVED" | "NO_ROUTE" | "NO_ATS_DATA";
  confidence: number | null;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | null;
  routeCoveragePercent: number | null;
  tokens: RouteToken[];
  matchedWaypoints: MatchedWaypoint[];
  matchedSegments: MatchedAtsSegment[];
  unresolvedRouteTokens: string[];
  currentSegment: MatchedAtsSegment | null;
  previousWaypoint: MatchedWaypoint | null;
  nextWaypoint: MatchedWaypoint | null;
  distanceToNextWaypointNm: number | null;
  crossTrackDeviationNm: number | null;
  progress: {
    completedSegmentIds: string[];
    currentSegmentId: string | null;
    remainingSegmentIds: string[];
  };
  source: {
    aircraftRouteSource: string | null;
    atsEffectiveDate: string | null;
    atsName: string | null;
    atsReference: string | null;
  };
}

interface PointRef {
  route: CzAtsRoute;
  point: CzAtsPoint;
}

interface StaticMatchedSegment {
  segment: CzAtsSegment;
  route: CzAtsRoute;
  direction: "FORWARD" | "REVERSE";
  routeLegIndex: number;
  confidence: "HIGH" | "MEDIUM";
}

interface StaticAnalysis {
  result: RouteIntelligenceResult;
  routeWaypoints: Map<number, PointRef>;
  staticSegments: StaticMatchedSegment[];
  eligibleLegs: number;
  matchedLegs: Set<number>;
}

const staticCache = new Map<string, StaticAnalysis>();

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function cleanToken(value: string): string {
  return value.trim().toUpperCase().replace(/^[,;]+|[,;]+$/g, "");
}

function fallbackWaypointSyntax(value: string): boolean {
  // A conservative fallback for common fix/navaid names. Tokens containing
  // digits are left unresolved unless the ATS dataset identifies them.
  return /^[A-Z]{2,5}$/.test(value);
}

export function tokenizeRoute(routeText: string | null | undefined, options: { airwayDesignators?: ReadonlySet<string>; waypointNames?: ReadonlySet<string> } = {}): RouteToken[] {
  if (!routeText?.trim()) return [];
  const airways = new Set([...options.airwayDesignators ?? []].map(normalized));
  const waypoints = new Set([...options.waypointNames ?? []].map(normalized));
  return routeText
    .split(/\s+/)
    .map(cleanToken)
    .filter(Boolean)
    .map((value, index): RouteToken => {
      if (value === "DCT") return { type: "DCT", value, index };
      if (airways.has(value) || /^[A-Z][0-9]{1,3}[A-Z]?$/.test(value)) return { type: "AIRWAY", value, index };
      if (waypoints.has(value) || fallbackWaypointSyntax(value)) return { type: "WAYPOINT", value, index };
      return { type: "UNKNOWN", value, index };
    });
}

function networkPointNames(network: RouteIntelligenceNetwork): Set<string> {
  return new Set(network.routes.flatMap((route) => route.points.map((point) => normalized(point.name))));
}

function routeSource(input: AircraftRouteInput | AircraftEnrichment | null | undefined): string | null {
  if (!input) return null;
  const candidate = input as AircraftRouteInput;
  if (candidate.flightPlan?.source?.trim()) return candidate.flightPlan.source.trim();
  if (candidate.source?.trim()) return candidate.source.trim();
  return candidate.route?.source?.trim() || null;
}

function routeFields(input: AircraftRouteInput | AircraftEnrichment | null | undefined): { text: string | null; source: string | null } {
  if (!input) return { text: null, source: null };
  const candidate = input as AircraftRouteInput;
  const plan = candidate.flightPlan;
  const filedRoute = plan?.filedRoute ?? candidate.filedRoute ?? null;
  const waypoints = plan?.waypoints ?? candidate.waypoints ?? [];
  const text = filedRoute?.trim() || waypoints.filter((value) => typeof value === "string" && value.trim()).join(" ") || null;
  return { text, source: routeSource(input) };
}

function routeKey(network: RouteIntelligenceNetwork, tokens: RouteToken[]): string {
  const routeShape = network.routes.map((route) => `${route.designator}:${route.segments.map((segment) => `${segment.id}:${segment.fromName}:${segment.toName}`).join(",")}`).join("|");
  return `${network.source.effectiveDate}:${routeShape}:${tokens.map((token) => `${token.type}:${token.value}`).join(" ")}`;
}

function pointCandidates(network: RouteIntelligenceNetwork, name: string, designator?: string): PointRef[] {
  const normalizedName = normalized(name);
  return network.routes
    .filter((route) => !designator || normalized(route.designator) === normalized(designator))
    .flatMap((route) => route.points.filter((point) => normalized(point.name) === normalizedName).map((point) => ({ route, point })));
}

function samePoint(left: PointRef, right: PointRef): boolean {
  return left.route.designator === right.route.designator && left.point.id === right.point.id;
}

function isDiscontinuity(route: CzAtsRoute, fromName: string, toName: string): boolean {
  const from = normalized(fromName);
  const to = normalized(toName);
  const ids = new Map(route.points.map((point) => [normalized(point.name), point.id]));
  const fromId = ids.get(from);
  const toId = ids.get(to);
  if (!fromId || !toId) return false;
  return route.discontinuities.some((item) =>
    (item.afterPointId === fromId && item.beforePointId === toId)
      || (item.afterPointId === toId && item.beforePointId === fromId));
}

function segmentFromTo(route: CzAtsRoute, segment: CzAtsSegment): { from: PointRef | null; to: PointRef | null } {
  const from = route.points.find((point) => normalized(point.name) === normalized(segment.fromName));
  const to = route.points.find((point) => normalized(point.name) === normalized(segment.toName));
  return { from: from ? { route, point: from } : null, to: to ? { route, point: to } : null };
}

function findPath(route: CzAtsRoute, start: PointRef, end: PointRef): Array<{ segment: CzAtsSegment; direction: "FORWARD" | "REVERSE" }> | null {
  if (!samePoint(start, { route, point: start.point }) || !samePoint(end, { route, point: end.point })) return null;
  if (start.point.id === end.point.id) return [];
  type SearchState = { pointId: string; path: Array<{ segment: CzAtsSegment; direction: "FORWARD" | "REVERSE" }>; visited: Set<string> };
  const queue: SearchState[] = [{ pointId: start.point.id, path: [], visited: new Set([start.point.id]) }];
  let steps = 0;
  while (queue.length && steps < MAX_PATH_SEARCH_STEPS) {
    steps += 1;
    const current = queue.shift()!;
    for (const segment of route.segments) {
      const endpoints = segmentFromTo(route, segment);
      if (!endpoints.from || !endpoints.to || isDiscontinuity(route, endpoints.from.point.name, endpoints.to.point.name)) continue;
      let nextPointId: string | null = null;
      let direction: "FORWARD" | "REVERSE" = "FORWARD";
      if (endpoints.from.point.id === current.pointId) nextPointId = endpoints.to.point.id;
      else if (endpoints.to.point.id === current.pointId) {
        nextPointId = endpoints.from.point.id;
        direction = "REVERSE";
      }
      if (!nextPointId || current.visited.has(nextPointId)) continue;
      const path = [...current.path, { segment, direction }];
      if (nextPointId === end.point.id) return path;
      const visited = new Set(current.visited);
      visited.add(nextPointId);
      queue.push({ pointId: nextPointId, path, visited });
    }
  }
  return null;
}

function directPath(network: RouteIntelligenceNetwork, startName: string, endName: string, designator?: string): Array<{ segment: CzAtsSegment; route: CzAtsRoute; direction: "FORWARD" | "REVERSE" }> | null {
  const candidates: Array<{ segment: CzAtsSegment; route: CzAtsRoute; direction: "FORWARD" | "REVERSE" }> = [];
  for (const route of network.routes.filter((candidate) => !designator || normalized(candidate.designator) === normalized(designator))) {
    for (const segment of route.segments) {
      if (isDiscontinuity(route, segment.fromName, segment.toName)) continue;
      if (normalized(segment.fromName) === normalized(startName) && normalized(segment.toName) === normalized(endName)) candidates.push({ segment, route, direction: "FORWARD" });
      if (normalized(segment.toName) === normalized(startName) && normalized(segment.fromName) === normalized(endName)) candidates.push({ segment, route, direction: "REVERSE" });
    }
  }
  return candidates.length === 1 ? candidates : null;
}

function directionConfidence(segment: CzAtsSegment, direction: "FORWARD" | "REVERSE", explicitAirway: boolean): "HIGH" | "MEDIUM" {
  return explicitAirway && (direction === "FORWARD" ? segment.magTrackForwardDeg !== null : segment.magTrackReverseDeg !== null) ? "HIGH" : "MEDIUM";
}

function baseSegmentMatch(match: StaticMatchedSegment): MatchedAtsSegment {
  const reverse = match.direction === "REVERSE";
  return {
    segmentId: match.segment.id,
    routeDesignator: match.route.designator,
    fromName: reverse ? match.segment.toName : match.segment.fromName,
    toName: reverse ? match.segment.fromName : match.segment.toName,
    from: reverse ? match.segment.to : match.segment.from,
    to: reverse ? match.segment.from : match.segment.to,
    direction: match.direction,
    routeLegIndex: match.routeLegIndex,
    confidence: match.confidence,
    crossTrackDeviationNm: null,
    alongTrackProgress: null,
    headingCompatible: null,
  };
}

function noPositionResult(result: RouteIntelligenceResult): RouteIntelligenceResult {
  return { ...result, currentSegment: null, previousWaypoint: null, nextWaypoint: null, distanceToNextWaypointNm: null, crossTrackDeviationNm: null, progress: { completedSegmentIds: [], currentSegmentId: null, remainingSegmentIds: result.matchedSegments.map((segment) => segment.segmentId) } };
}

function staticResult(input: AircraftRouteInput | AircraftEnrichment | null | undefined, network: RouteIntelligenceNetwork | null): StaticAnalysis {
  const fields = routeFields(input);
  const source = { aircraftRouteSource: fields.source, atsEffectiveDate: network?.source.effectiveDate ?? null, atsName: network?.source.name ?? null, atsReference: network?.source.reference ?? null };
  if (!fields.text) {
    return { result: { status: "NO_ROUTE", confidence: null, confidenceLevel: null, routeCoveragePercent: null, tokens: [], matchedWaypoints: [], matchedSegments: [], unresolvedRouteTokens: [], currentSegment: null, previousWaypoint: null, nextWaypoint: null, distanceToNextWaypointNm: null, crossTrackDeviationNm: null, progress: { completedSegmentIds: [], currentSegmentId: null, remainingSegmentIds: [] }, source }, routeWaypoints: new Map(), staticSegments: [], eligibleLegs: 0, matchedLegs: new Set() };
  }
  const tokens = network ? tokenizeRoute(fields.text, { airwayDesignators: new Set(network.routes.map((route) => route.designator)), waypointNames: networkPointNames(network) }) : tokenizeRoute(fields.text);
  if (!network) {
    return { result: { status: "NO_ATS_DATA", confidence: null, confidenceLevel: null, routeCoveragePercent: null, tokens, matchedWaypoints: [], matchedSegments: [], unresolvedRouteTokens: tokens.filter((token) => token.type === "UNKNOWN").map((token) => token.value), currentSegment: null, previousWaypoint: null, nextWaypoint: null, distanceToNextWaypointNm: null, crossTrackDeviationNm: null, progress: { completedSegmentIds: [], currentSegmentId: null, remainingSegmentIds: [] }, source }, routeWaypoints: new Map(), staticSegments: [], eligibleLegs: 0, matchedLegs: new Set() };
  }

  const routeWaypoints = new Map<number, PointRef>();
  const matchedWaypoints = new Map<number, MatchedWaypoint>();
  const staticSegments: StaticMatchedSegment[] = [];
  const matchedLegs = new Set<number>();
  const unresolved = tokens.filter((token) => token.type === "UNKNOWN").map((token) => token.value);
  let eligibleLegs = 0;
  let legIndex = 0;

  for (let left = 0; left < tokens.length;) {
    if (tokens[left].type !== "WAYPOINT") { left += 1; continue; }
    let right = left + 1;
    while (right < tokens.length && tokens[right].type !== "WAYPOINT") right += 1;
    if (right >= tokens.length || tokens.slice(left + 1, right).some((token) => token.type === "UNKNOWN")) { left = right; continue; }
    const between = tokens.slice(left + 1, right);
    const isDct = between.some((token) => token.type === "DCT");
    const airway = between.filter((token) => token.type === "AIRWAY");
    const startName = tokens[left].value;
    const endName = tokens[right].value;
    const startCandidates = pointCandidates(network, startName, airway.length === 1 ? airway[0].value : undefined);
    const endCandidates = pointCandidates(network, endName, airway.length === 1 ? airway[0].value : undefined);
    let path: Array<{ segment: CzAtsSegment; route: CzAtsRoute; direction: "FORWARD" | "REVERSE" }> | null = null;
    let explicitAirway = false;
    if (!isDct && airway.length <= 1 && startCandidates.length && endCandidates.length) {
      if (airway.length === 1) {
        explicitAirway = true;
        for (const start of startCandidates) {
          for (const end of endCandidates) {
            if (start.route.designator !== end.route.designator) continue;
            const candidate = findPath(start.route, start, end);
            if (!candidate) continue;
            const mapped = candidate.map((item) => ({ ...item, route: start.route }));
            if (path && JSON.stringify(path.map((item) => item.segment.id)) !== JSON.stringify(mapped.map((item) => item.segment.id))) { path = null; break; }
            path = mapped;
          }
          if (path === null && explicitAirway) break;
        }
      } else {
        path = directPath(network, startName, endName);
      }
    }
    if (!isDct) {
      eligibleLegs += 1;
      if (path && path.length) {
        matchedLegs.add(legIndex);
        const first = path[0];
        const last = path[path.length - 1];
        const startRef = pointCandidates(network, startName, first.route.designator).find((candidate) => candidate.route.designator === first.route.designator);
        const endRef = pointCandidates(network, endName, last.route.designator).find((candidate) => candidate.route.designator === last.route.designator);
        if (startRef) routeWaypoints.set(tokens[left].index, startRef);
        if (endRef) routeWaypoints.set(tokens[right].index, endRef);
        if (startRef) matchedWaypoints.set(tokens[left].index, { routeToken: startName, tokenIndex: tokens[left].index, pointId: startRef.point.id, name: startRef.point.name, latitude: startRef.point.latitude, longitude: startRef.point.longitude, confidence: explicitAirway ? "HIGH" : "MEDIUM" });
        if (endRef) matchedWaypoints.set(tokens[right].index, { routeToken: endName, tokenIndex: tokens[right].index, pointId: endRef.point.id, name: endRef.point.name, latitude: endRef.point.latitude, longitude: endRef.point.longitude, confidence: explicitAirway ? "HIGH" : "MEDIUM" });
        for (const item of path) staticSegments.push({ segment: item.segment, route: item.route, direction: item.direction, routeLegIndex: legIndex, confidence: directionConfidence(item.segment, item.direction, explicitAirway) });
      }
    }
    legIndex += 1;
    left = right;
  }

  // Preserve exact ATS point matches even when the surrounding leg is DCT or
  // crosses a discontinuity. Those points are known; only the connection is
  // unresolved.
  for (const token of tokens.filter((candidate) => candidate.type === "WAYPOINT")) {
    if (matchedWaypoints.has(token.index)) continue;
    const candidates = pointCandidates(network, token.value);
    if (candidates.length === 1) {
      const candidate = candidates[0];
      routeWaypoints.set(token.index, candidate);
      matchedWaypoints.set(token.index, { routeToken: token.value, tokenIndex: token.index, pointId: candidate.point.id, name: candidate.point.name, latitude: candidate.point.latitude, longitude: candidate.point.longitude, confidence: "MEDIUM" });
    } else {
      unresolved.push(token.value);
    }
  }

  const segments = staticSegments.map(baseSegmentMatch);
  const coverage = eligibleLegs > 0 ? Math.round((matchedLegs.size / eligibleLegs) * 100) : null;
  const scoreValues = staticSegments.map((segment) => segment.confidence === "HIGH" ? 1 : 0.72);
  const confidence = scoreValues.length ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length : null;
  const status = segments.length === 0 ? "UNRESOLVED" : coverage === 100 && unresolved.length === 0 ? "MATCHED" : "PARTIAL";
  const result: RouteIntelligenceResult = noPositionResult({ status, confidence, confidenceLevel: confidence === null ? null : confidence >= 0.9 ? "HIGH" : confidence >= 0.7 ? "MEDIUM" : "LOW", routeCoveragePercent: coverage, tokens, matchedWaypoints: [...matchedWaypoints.values()].sort((a, b) => a.tokenIndex - b.tokenIndex), matchedSegments: segments, unresolvedRouteTokens: unique(unresolved), currentSegment: null, previousWaypoint: null, nextWaypoint: null, distanceToNextWaypointNm: null, crossTrackDeviationNm: null, progress: { completedSegmentIds: [], currentSegmentId: null, remainingSegmentIds: segments.map((segment) => segment.segmentId) }, source });
  return { result, routeWaypoints, staticSegments, eligibleLegs, matchedLegs };
}

function configuredMaxXtrackNm(): number {
  const value = Number(typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ROUTE_INTELLIGENCE_MAX_XTRACK_NM ?? process.env.ROUTE_INTELLIGENCE_MAX_XTRACK_NM : NaN);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_XTRACK_NM;
}

function angularDistanceNm(from: [number, number], to: [number, number]): number {
  return haversineDistanceKm(from[1], from[0], to[1], to[0]) / KM_PER_NM;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function angleDifference(left: number, right: number): number {
  return Math.abs(((normalizeDegrees(left - right) + 180) % 360) - 180);
}

function segmentMetrics(position: AircraftPositionInput, segment: MatchedAtsSegment): { distanceNm: number; crossTrackNm: number; along: number } | null {
  if (!finite(position.lat) || !finite(position.lon)) return null;
  const start: [number, number] = segment.from;
  const end: [number, number] = segment.to;
  const point: [number, number] = [position.lon, position.lat];
  const length = angularDistanceNm(start, end);
  if (!Number.isFinite(length) || length <= 0) return null;
  const startToPoint = angularDistanceNm(start, point);
  const bearingStartEnd = initialBearing(start[1], start[0], end[1], end[0]) * Math.PI / 180;
  const bearingStartPoint = initialBearing(start[1], start[0], point[1], point[0]) * Math.PI / 180;
  const angularLength = length * KM_PER_NM / EARTH_RADIUS_KM;
  const angularStartPoint = startToPoint * KM_PER_NM / EARTH_RADIUS_KM;
  const crossTrackAngular = Math.asin(Math.max(-1, Math.min(1, Math.sin(angularStartPoint) * Math.sin(bearingStartPoint - bearingStartEnd))));
  const alongAngular = Math.atan2(Math.sin(angularStartPoint) * Math.cos(bearingStartPoint - bearingStartEnd), Math.cos(angularStartPoint));
  const along = alongAngular / angularLength;
  const perpendicular = Math.abs(crossTrackAngular * EARTH_RADIUS_KM / KM_PER_NM);
  const endpointDistance = along < 0 ? angularDistanceNm(point, start) : along > 1 ? angularDistanceNm(point, end) : perpendicular;
  return { distanceNm: endpointDistance, crossTrackNm: perpendicular, along };
}

function withPosition(staticAnalysis: StaticAnalysis, position: AircraftPositionInput | null | undefined): RouteIntelligenceResult {
  const base = staticAnalysis.result;
  if (!position || !finite(position.lat) || !finite(position.lon) || !base.matchedSegments.length) return base;
  const maxXtrackNm = configuredMaxXtrackNm();
  const candidates = base.matchedSegments.map((segment) => {
    const metrics = segmentMetrics(position, segment);
    if (!metrics) return { segment, metrics: null, score: Number.POSITIVE_INFINITY, compatible: null };
    const expected = initialBearing(segment.from[1], segment.from[0], segment.to[1], segment.to[0]);
    const compatible = !finite(position.track) || angleDifference(position.track, expected) <= 75;
    const headingPenalty = compatible ? 0 : Math.min(12, angleDifference(position.track!, expected) / 15);
    return { segment, metrics, score: metrics.distanceNm + headingPenalty, compatible };
  }).filter((candidate) => candidate.metrics !== null).sort((left, right) => left.score - right.score);
  const nearest = candidates[0];
  if (!nearest?.metrics || nearest.metrics.distanceNm > maxXtrackNm) return base;

  const dynamicSegments = base.matchedSegments.map((segment) => {
    const candidate = candidates.find((item) => item.segment.segmentId === segment.segmentId && item.segment.routeLegIndex === segment.routeLegIndex);
    return candidate?.metrics ? { ...segment, crossTrackDeviationNm: candidate.metrics.crossTrackNm, alongTrackProgress: candidate.metrics.along, headingCompatible: candidate.compatible } : segment;
  });
  const current = nearest.metrics.along >= 0 && nearest.metrics.along <= 1 ? dynamicSegments.find((segment) => segment.segmentId === nearest.segment.segmentId && segment.routeLegIndex === nearest.segment.routeLegIndex) ?? null : null;
  const beforeFirst = nearest.metrics.along < 0 && nearest.segment.routeLegIndex === Math.min(...base.matchedSegments.map((segment) => segment.routeLegIndex));
  const afterLast = nearest.metrics.along > 1 && nearest.segment.routeLegIndex === Math.max(...base.matchedSegments.map((segment) => segment.routeLegIndex));
  const completed = current
    ? dynamicSegments.filter((segment) => segment.routeLegIndex < current.routeLegIndex).map((segment) => segment.segmentId)
    : afterLast ? dynamicSegments.map((segment) => segment.segmentId) : [];
  const remaining = dynamicSegments.filter((segment) => !completed.includes(segment.segmentId) && segment.segmentId !== current?.segmentId).map((segment) => segment.segmentId);
  const matchedWaypoint = (name: string, preferTokenIndex: number): MatchedWaypoint | null => {
    const candidates = base.matchedWaypoints.filter((waypoint) => normalized(waypoint.name) === normalized(name));
    return candidates.sort((left, right) => Math.abs(left.tokenIndex - preferTokenIndex) - Math.abs(right.tokenIndex - preferTokenIndex))[0] ?? null;
  };
  let previousWaypoint: MatchedWaypoint | null = null;
  let nextWaypoint: MatchedWaypoint | null = null;
  if (current) {
    previousWaypoint = matchedWaypoint(current.fromName, current.routeLegIndex);
    nextWaypoint = matchedWaypoint(current.toName, current.routeLegIndex + 1);
  } else if (beforeFirst) {
    nextWaypoint = base.matchedWaypoints.find((waypoint) => normalized(waypoint.name) === normalized(nearest.segment.fromName)) ?? null;
  } else if (afterLast) {
    previousWaypoint = base.matchedWaypoints.find((waypoint) => normalized(waypoint.name) === normalized(nearest.segment.toName)) ?? null;
  }
  const distanceToNext = nextWaypoint && finite(position.lat) && finite(position.lon)
    ? haversineDistanceKm(position.lat, position.lon, nextWaypoint.latitude, nextWaypoint.longitude) / KM_PER_NM
    : null;
  return { ...base, matchedSegments: dynamicSegments, currentSegment: current, previousWaypoint, nextWaypoint, distanceToNextWaypointNm: distanceToNext, crossTrackDeviationNm: current?.crossTrackDeviationNm ?? null, progress: { completedSegmentIds: completed, currentSegmentId: current?.segmentId ?? null, remainingSegmentIds: remaining } };
}

export function analyzePublishedRouteStatic(options: { aircraftRoute: AircraftRouteInput | AircraftEnrichment | null | undefined; atsNetwork: RouteIntelligenceNetwork | null }): RouteIntelligenceResult {
  const fields = routeFields(options.aircraftRoute);
  const tokens = options.atsNetwork ? tokenizeRoute(fields.text, { airwayDesignators: new Set(options.atsNetwork.routes.map((route) => route.designator)), waypointNames: networkPointNames(options.atsNetwork) }) : tokenizeRoute(fields.text);
  const key = options.atsNetwork ? routeKey(options.atsNetwork, tokens) : `no-network:${fields.text ?? ""}`;
  const cached = staticCache.get(key);
  if (cached) return cached.result;
  const analysis = staticResult(options.aircraftRoute, options.atsNetwork);
  staticCache.set(key, analysis);
  while (staticCache.size > MAX_STATIC_CACHE_ENTRIES) staticCache.delete(staticCache.keys().next().value!);
  return analysis.result;
}

export function analyzePublishedRoute(options: { aircraftRoute: AircraftRouteInput | AircraftEnrichment | null | undefined; aircraftPosition: AircraftPositionInput | null | undefined; atsNetwork: RouteIntelligenceNetwork | null }): RouteIntelligenceResult {
  const fields = routeFields(options.aircraftRoute);
  const tokens = options.atsNetwork ? tokenizeRoute(fields.text, { airwayDesignators: new Set(options.atsNetwork.routes.map((route) => route.designator)), waypointNames: networkPointNames(options.atsNetwork) }) : tokenizeRoute(fields.text);
  const key = options.atsNetwork ? routeKey(options.atsNetwork, tokens) : `no-network:${fields.text ?? ""}`;
  let analysis = staticCache.get(key);
  if (!analysis) {
    analysis = staticResult(options.aircraftRoute, options.atsNetwork);
    staticCache.set(key, analysis);
    while (staticCache.size > MAX_STATIC_CACHE_ENTRIES) staticCache.delete(staticCache.keys().next().value!);
  }
  return withPosition(analysis, options.aircraftPosition);
}

export function clearRouteIntelligenceCache(): void {
  staticCache.clear();
}
