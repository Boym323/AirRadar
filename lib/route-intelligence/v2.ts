import type { AircraftEnrichment } from "@/lib/aircraft/types";
import type { AviationNavPoint } from "@/lib/navigation-data/types";
import type { CzAtsPoint, CzAtsRoute, CzAtsSegment } from "@/lib/ats/cz-routes";
import type {
  InterpretedRoute,
  InterpretedRouteElement,
  InterpretedRouteGeometry,
  InterpretedRoutePoint,
  RouteElementSource,
  RouteIntelligenceV2Snapshot,
  RunwayContextInput,
} from "./contracts";
import { createRunwayContext } from "./contracts";
import type { AircraftRouteInput, RouteIntelligenceNetwork } from "./index";
import { analyzeDynamicRoute } from "./dynamic";

export interface RouteIntelligenceV2Options {
  aircraftRoute?: AircraftRouteInput | AircraftEnrichment | null;
  filedRoute?: string | null;
  waypoints?: string[] | null;
  source?: string | null;
  atsNetwork?: RouteIntelligenceNetwork | null;
  /** Bounded on-demand reference points supplement published ATS geometry. */
  referencePoints?: readonly AviationNavPoint[] | null;
  originAirportIcao?: string | null;
  destinationAirportIcao?: string | null;
  /** Convenient aliases for callers that already have airport context. */
  origin?: string | null;
  destination?: string | null;
  runway?: RunwayContextInput;
  aircraft?: { lat: number | null; lon: number | null; track?: number | null; altitude?: number | null } | null;
  previousDynamicState?: RouteIntelligenceV2Snapshot["dynamic"] | null;
}

type V2TokenType = "WAYPOINT" | "AIRWAY" | "DCT" | "UNKNOWN";

interface V2Token {
  type: V2TokenType;
  value: string;
  index: number;
}

interface PointRef {
  route: CzAtsRoute;
  point: CzAtsPoint;
}

interface PathItem {
  route: CzAtsRoute;
  segment: CzAtsSegment;
  direction: "FORWARD" | "REVERSE";
}

const MAX_PATH_SEARCH_STEPS = 256;
const MAX_STATIC_CACHE_ENTRIES = 128;
const staticCache = new Map<string, InterpretedRoute>();

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function cleanToken(value: string): string {
  return value.trim().toUpperCase().replace(/^[,;]+|[,;]+$/g, "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function routeFields(options: RouteIntelligenceV2Options): { text: string | null; source: string | null } {
  const input = options.aircraftRoute;
  if (input) {
    const candidate = input as AircraftRouteInput;
    const filedRoute = candidate.flightPlan?.filedRoute ?? candidate.filedRoute ?? null;
    const waypoints = candidate.flightPlan?.waypoints ?? candidate.waypoints ?? [];
    return {
      text: filedRoute?.trim() || waypoints.filter((value) => typeof value === "string" && value.trim()).join(" ") || null,
      source: candidate.flightPlan?.source?.trim() || candidate.source?.trim() || candidate.route?.source?.trim() || null,
    };
  }
  return {
    text: options.filedRoute?.trim() || options.waypoints?.filter((value) => typeof value === "string" && value.trim()).join(" ") || null,
    source: options.source?.trim() || null,
  };
}

function airportContext(options: RouteIntelligenceV2Options): { origin: string | null; destination: string | null } {
  return {
    origin: normalized(options.originAirportIcao ?? options.origin ?? "") || null,
    destination: normalized(options.destinationAirportIcao ?? options.destination ?? "") || null,
  };
}

function genericTokenType(value: string, network: RouteIntelligenceNetwork | null, referencePoints: readonly AviationNavPoint[]): V2TokenType {
  if (value === "DCT") return "DCT";
  const publishedAirway = network?.routes.some((route) => normalized(route.designator) === value) ?? false;
  if (publishedAirway) return "AIRWAY";
  if (referencePoints.some((point) => normalized(point.id) === value)
    || network?.routes.some((route) => route.points.some((point) => normalized(point.name) === value))
    || /^[A-Z]{2,5}$/.test(value)) return "WAYPOINT";
  if (/^[A-Z][0-9]{1,3}[A-Z]?$/.test(value)) return "AIRWAY";
  return "UNKNOWN";
}

function tokensFor(options: RouteIntelligenceV2Options, network: RouteIntelligenceNetwork | null): V2Token[] {
  const fields = routeFields(options);
  const referencePoints = options.referencePoints ?? [];
  if (!fields.text) return [];
  return fields.text.split(/\s+/).map(cleanToken).filter(Boolean).map((value, index) => ({
    type: genericTokenType(value, network, referencePoints), value, index,
  }));
}

function networkPointCandidates(network: RouteIntelligenceNetwork | null, name: string, designator?: string): PointRef[] {
  if (!network) return [];
  const wanted = normalized(name);
  return network.routes
    .filter((route) => !designator || normalized(route.designator) === normalized(designator))
    .flatMap((route) => route.points.filter((point) => normalized(point.name) === wanted).map((point) => ({ route, point })));
}

function discontinuity(route: CzAtsRoute, fromName: string, toName: string): boolean {
  const ids = new Map(route.points.map((point) => [normalized(point.name), point.id]));
  const fromId = ids.get(normalized(fromName));
  const toId = ids.get(normalized(toName));
  return Boolean(fromId && toId && route.discontinuities.some((item) =>
    (item.afterPointId === fromId && item.beforePointId === toId)
      || (item.afterPointId === toId && item.beforePointId === fromId)));
}

function findAirwayPath(network: RouteIntelligenceNetwork, designator: string, startName: string, endName: string): PathItem[] | null {
  const routes = network.routes.filter((route) => normalized(route.designator) === normalized(designator));
  if (!routes.length) return null;
  const start = normalized(startName);
  const end = normalized(endName);
  if (start === end) return [];
  type SearchState = { pointName: string; path: PathItem[]; visited: Set<string> };
  const queue: SearchState[] = [{ pointName: start, path: [], visited: new Set([start]) }];
  let steps = 0;
  while (queue.length && steps < MAX_PATH_SEARCH_STEPS) {
    steps += 1;
    const current = queue.shift()!;
    for (const route of routes) {
      for (const segment of route.segments) {
        if (discontinuity(route, segment.fromName, segment.toName)) continue;
        let nextName: string | null = null;
        let direction: "FORWARD" | "REVERSE" = "FORWARD";
        if (normalized(segment.fromName) === current.pointName) nextName = normalized(segment.toName);
        else if (normalized(segment.toName) === current.pointName) {
          nextName = normalized(segment.fromName);
          direction = "REVERSE";
        }
        if (!nextName || current.visited.has(nextName)) continue;
        const path = [...current.path, { route, segment, direction }];
        if (nextName === end) return path;
        const visited = new Set(current.visited);
        visited.add(nextName);
        queue.push({ pointName: nextName, path, visited });
      }
    }
  }
  return null;
}

function directPath(network: RouteIntelligenceNetwork, startName: string, endName: string): PathItem[] | null {
  const candidates: PathItem[][] = [];
  for (const route of network.routes) {
    for (const segment of route.segments) {
      if (discontinuity(route, segment.fromName, segment.toName)) continue;
      if (normalized(segment.fromName) === normalized(startName) && normalized(segment.toName) === normalized(endName)) candidates.push([{ route, segment, direction: "FORWARD" }]);
      if (normalized(segment.toName) === normalized(startName) && normalized(segment.fromName) === normalized(endName)) candidates.push([{ route, segment, direction: "REVERSE" }]);
    }
  }
  return candidates.length === 1 ? candidates[0]! : null;
}

function sourceForAts(network: RouteIntelligenceNetwork): RouteElementSource {
  return {
    kind: "PUBLISHED_ATS",
    provider: network.source.name,
    countryCode: null,
    reference: network.source.reference,
    procedureId: null,
    effectiveDate: network.source.effectiveDate,
    airacCycle: null,
    amendment: network.source.aipAmendment ?? network.source.airacAmendment ?? null,
  };
}

function sourceForFiled(kind: "FILED_DCT" | "FILED_ROUTE" | "SCHEMATIC", filedSource: string | null, reference: string | null = null): RouteElementSource {
  return { kind, provider: filedSource, countryCode: null, reference, procedureId: null, effectiveDate: null, airacCycle: null, amendment: null };
}

function point(value: CzAtsPoint | null): InterpretedRoutePoint | null {
  if (!value) return null;
  return { id: value.id, name: value.name, coordinates: finiteCoordinates(value.latitude, value.longitude) ? { lat: value.latitude, lon: value.longitude } : null };
}

function finiteCoordinates(latitude: number | null, longitude: number | null): boolean {
  return latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);
}

function pointFromNetwork(ref: PointRef | null): InterpretedRoutePoint | null {
  return ref ? point(ref.point) : null;
}

function referencePointCandidates(points: readonly AviationNavPoint[], name: string): AviationNavPoint[] {
  const wanted = normalized(name);
  return points.filter((candidate) => normalized(candidate.id) === wanted);
}

function pointFromReference(reference: AviationNavPoint | null): InterpretedRoutePoint | null {
  if (!reference || !finiteCoordinates(reference.latitude, reference.longitude)) return null;
  return {
    id: `awc:${reference.kind}:${reference.id}:${reference.latitude.toFixed(5)}:${reference.longitude.toFixed(5)}`,
    name: reference.id,
    coordinates: { lat: reference.latitude, lon: reference.longitude },
  };
}

function resolveFiledPoint(network: RouteIntelligenceNetwork | null, referencePoints: readonly AviationNavPoint[], name: string): InterpretedRoutePoint | null {
  const networkCandidates = networkPointCandidates(network, name);
  if (networkCandidates.length === 1) return pointFromNetwork(networkCandidates[0]!);
  const referenceCandidates = referencePointCandidates(referencePoints, name);
  return referenceCandidates.length === 1 ? pointFromReference(referenceCandidates[0]!) : null;
}

function lineGeometry(from: InterpretedRoutePoint | null, to: InterpretedRoutePoint | null): InterpretedRouteGeometry | null {
  if (!from?.coordinates || !to?.coordinates) return null;
  return { type: "LINE", coordinates: [from.coordinates, to.coordinates] };
}

function atsElements(path: PathItem[], sequence: number, network: RouteIntelligenceNetwork): InterpretedRouteElement[] {
  return path.map((item, offset) => {
    const reverse = item.direction === "REVERSE";
    const fromName = reverse ? item.segment.toName : item.segment.fromName;
    const toName = reverse ? item.segment.fromName : item.segment.toName;
    const from = pointFromNetwork(networkPointCandidates(network, fromName, item.route.designator).find((candidate) => candidate.route === item.route) ?? null);
    const to = pointFromNetwork(networkPointCandidates(network, toName, item.route.designator).find((candidate) => candidate.route === item.route) ?? null);
    return {
      id: `ats:${item.segment.id}:${item.direction}`,
      sequence: sequence + offset,
      kind: "PUBLISHED_ATS",
      phase: "EN_ROUTE",
      label: item.route.designator,
      from,
      to,
      geometry: lineGeometry(from, to),
      source: sourceForAts(network),
      status: from && to ? "RESOLVED" : "UNRESOLVED",
      unresolvedReason: from && to ? null : "ATS endpoint is outside loaded point data",
    };
  });
}

function unresolvedElement(label: string, phase: RoutePhase, sequence: number, reason: string, filedSource: string | null): InterpretedRouteElement {
  return {
    id: `unresolved:${sequence}:${label}`,
    sequence,
    kind: "UNRESOLVED_CONNECTOR",
    phase,
    label,
    from: null,
    to: null,
    geometry: null,
    source: sourceForFiled("SCHEMATIC", filedSource),
    status: "UNRESOLVED",
    unresolvedReason: reason,
  };
}

function dctElement(startName: string, endName: string, sequence: number, network: RouteIntelligenceNetwork | null, referencePoints: readonly AviationNavPoint[], filedSource: string | null): InterpretedRouteElement {
  const from = resolveFiledPoint(network, referencePoints, startName);
  const to = resolveFiledPoint(network, referencePoints, endName);
  const geometry = lineGeometry(from, to);
  return {
    id: `dct:${sequence}:${startName}:${endName}`,
    sequence,
    kind: "FILED_DCT",
    phase: "EN_ROUTE",
    label: "DCT",
    from,
    to,
    geometry,
    source: sourceForFiled("FILED_DCT", filedSource, from && to ? "Published/reference waypoint coordinates" : null),
    status: geometry ? "RESOLVED" : "UNRESOLVED",
    unresolvedReason: geometry ? null : "DCT endpoints could not be resolved uniquely",
  };
}

function filedRouteConnector(
  startName: string,
  endName: string,
  label: string | null,
  sequence: number,
  network: RouteIntelligenceNetwork | null,
  referencePoints: readonly AviationNavPoint[],
  filedSource: string | null,
): InterpretedRouteElement | null {
  const from = resolveFiledPoint(network, referencePoints, startName);
  const to = resolveFiledPoint(network, referencePoints, endName);
  if (!from?.coordinates || !to?.coordinates) return null;
  return {
    id: `filed:${sequence}:${startName}:${endName}`,
    sequence,
    kind: "FILED_ROUTE",
    phase: "EN_ROUTE",
    label,
    from,
    to,
    geometry: { type: "SCHEMATIC", coordinates: [from.coordinates, to.coordinates] },
    source: sourceForFiled("FILED_ROUTE", filedSource, "Reference waypoint coordinates; published airway geometry unresolved"),
    status: "RESOLVED",
    unresolvedReason: null,
  };
}

function routeId(text: string): string {
  return `filed:${text.trim().replace(/\s+/g, " ").toUpperCase()}`;
}

function routeSources(elements: InterpretedRouteElement[]): RouteElementSource[] {
  const seen = new Set<string>();
  return elements.map((element) => element.source).filter((source) => {
    const key = JSON.stringify(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function statusFor(elements: InterpretedRouteElement[], hasRoute: boolean): InterpretedRoute["status"] {
  if (!hasRoute) return "NO_ROUTE";
  if (!elements.length || elements.every((element) => element.status === "UNRESOLVED")) return "UNRESOLVED";
  return elements.every((element) => element.status === "RESOLVED") ? "RESOLVED" : "PARTIAL";
}

function staticRoute(options: RouteIntelligenceV2Options): InterpretedRoute {
  const fields = routeFields(options);
  const network = options.atsNetwork ?? null;
  const referencePoints = options.referencePoints ?? [];
  if (!fields.text) {
    return { id: "filed:empty", status: "NO_ROUTE", elements: [], procedureMatches: [], sources: [], coverage: { ats: { eligibleLegs: 0, matchedLegs: 0, percent: null }, reconstruction: { totalElements: 0, resolvedElements: 0, percent: null }, progress: null } };
  }
  const context = airportContext(options);
  const cacheKey = JSON.stringify({
    route: fields.text,
    origin: context.origin,
    destination: context.destination,
    ats: network?.source?.effectiveDate ?? null,
    referencePoints: referencePoints.map((point) => `${point.kind}:${point.id}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`).sort(),
  });
  const cachedRoute = staticCache.get(cacheKey);
  if (cachedRoute) return cachedRoute;
  const tokens = tokensFor(options, network);
  const elements: InterpretedRouteElement[] = [];
  const elementOrder = new Map<string, number>();
  let sequence = 1;

  const waypoints = tokens.filter((token) => token.type === "WAYPOINT");
  let atsEligible = 0;
  let atsMatched = 0;
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const left = waypoints[index]!;
    const right = waypoints[index + 1]!;
    const between = tokens.filter((token) => token.index > left.index && token.index < right.index);
    if (between.some((token) => token.type === "UNKNOWN")) continue;
    const dct = between.some((token) => token.type === "DCT");
    const airways = unique(between.filter((token) => token.type === "AIRWAY").map((token) => token.value));
    if (dct) {
      const element = dctElement(left.value, right.value, sequence++, network, referencePoints, fields.source);
      elements.push(element);
      elementOrder.set(element.id, left.index + 0.5);
      continue;
    }
    atsEligible += 1;
    let path: PathItem[] | null = null;
    if (network && airways.length === 1) {
      path = findAirwayPath(network, airways[0]!, left.value, right.value);
    } else if (network && airways.length === 0) {
      path = directPath(network, left.value, right.value);
    }
    if (path?.length) {
      atsMatched += 1;
      const newElements = atsElements(path, sequence, network!);
      elements.push(...newElements);
      newElements.forEach((element, offset) => elementOrder.set(element.id, left.index + 0.5 + offset / 1000));
      sequence += path.length;
    } else {
      const filedConnector = filedRouteConnector(
        left.value,
        right.value,
        airways.length === 1 ? airways[0]! : null,
        sequence,
        network,
        referencePoints,
        fields.source,
      );
      const element = filedConnector
        ?? unresolvedElement(`${left.value}-${right.value}`, "CONNECTOR", sequence, "ATS leg could not be resolved", fields.source);
      sequence += 1;
      elements.push(element);
      elementOrder.set(element.id, left.index + 0.5);
    }
  }

  for (const token of tokens.filter((candidate) => candidate.type === "UNKNOWN")) {
    const element = unresolvedElement(token.value, "CONNECTOR", sequence++, "route token is not recognized by the loaded static data", fields.source);
    elements.push(element);
    elementOrder.set(element.id, token.index);
  }

  // Keep ATS and filed connector elements in the published route order.
  elements.sort((left, right) => {
    const leftIndex = elementOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = elementOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.sequence - right.sequence;
  }).forEach((element, index) => { element.sequence = index + 1; });
  const resolvedElements = elements.filter((element) => element.status === "RESOLVED").length;
  const result = {
    id: routeId(fields.text),
    status: statusFor(elements, true),
    elements,
    procedureMatches: [],
    sources: routeSources(elements),
    coverage: {
      ats: { eligibleLegs: atsEligible, matchedLegs: atsMatched, percent: atsEligible ? Math.round((atsMatched / atsEligible) * 100) : null },
      reconstruction: { totalElements: elements.length, resolvedElements, percent: elements.length ? Math.round((resolvedElements / elements.length) * 100) : null },
      progress: null,
    },
  };
  staticCache.set(cacheKey, result);
  if (staticCache.size > MAX_STATIC_CACHE_ENTRIES) staticCache.delete(staticCache.keys().next().value!);
  return result;
}

export function interpretFiledRoute(options: RouteIntelligenceV2Options): InterpretedRoute {
  return staticRoute(options);
}

export function analyzeRouteIntelligenceV2(options: RouteIntelligenceV2Options): RouteIntelligenceV2Snapshot {
  const route = staticRoute(options);
  const context = airportContext(options);
  return {
    route,
    dynamic: analyzeDynamicRoute({ route, aircraft: options.aircraft ?? undefined, previousState: options.previousDynamicState, airportContext: { departureAirportIcao: context.origin, arrivalAirportIcao: context.destination } }),
    runway: createRunwayContext(options.runway),
  };
}

export const analyzeRouteV2 = analyzeRouteIntelligenceV2;
