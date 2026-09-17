import type { AircraftEnrichment } from "@/lib/aircraft/types";
import type { CzAtsPoint, CzAtsRoute, CzAtsSegment } from "@/lib/ats/cz-routes";
import type {
  InterpretedRoute,
  InterpretedRouteElement,
  InterpretedRouteGeometry,
  InterpretedRoutePoint,
  Procedure,
  ProcedureCandidate,
  ProcedureMatch,
  ProcedureMatchEvidence,
  ProcedureRunwayCompatibility,
  RouteElementSource,
  RouteIntelligenceV2Snapshot,
  RoutePhase,
  RunwayContextInput,
} from "./contracts";
import { createRunwayContext } from "./contracts";
import type { AircraftRouteInput, RouteIntelligenceNetwork } from "./index";

export interface RouteIntelligenceV2Options {
  aircraftRoute?: AircraftRouteInput | AircraftEnrichment | null;
  filedRoute?: string | null;
  waypoints?: string[] | null;
  source?: string | null;
  atsNetwork?: RouteIntelligenceNetwork | null;
  procedures?: readonly Procedure[] | null;
  originAirportIcao?: string | null;
  destinationAirportIcao?: string | null;
  /** Convenient aliases for callers that already have airport context. */
  origin?: string | null;
  destination?: string | null;
  runway?: RunwayContextInput;
}

type V2TokenType = "WAYPOINT" | "AIRWAY" | "DCT" | "SID" | "STAR" | "UNKNOWN";

interface V2Token {
  type: V2TokenType;
  value: string;
  index: number;
  procedure?: Procedure;
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

interface ProcedureSelection {
  procedure: Procedure | null;
  match: ProcedureMatch;
}

const MAX_PATH_SEARCH_STEPS = 256;

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

function genericTokenType(value: string, network: RouteIntelligenceNetwork | null): V2TokenType {
  if (value === "DCT") return "DCT";
  if (network?.routes.some((route) => normalized(route.designator) === value) || /^[A-Z][0-9]{1,3}[A-Z]?$/.test(value)) return "AIRWAY";
  if (network?.routes.some((route) => route.points.some((point) => normalized(point.name) === value)) || /^[A-Z]{2,5}$/.test(value)) return "WAYPOINT";
  return "UNKNOWN";
}

function tokensFor(options: RouteIntelligenceV2Options, network: RouteIntelligenceNetwork | null, procedures: readonly Procedure[]): V2Token[] {
  const fields = routeFields(options);
  if (!fields.text) return [];
  const context = airportContext(options);
  const raw = fields.text.split(/\s+/).map(cleanToken).filter(Boolean);
  return raw.map((value, index) => {
    const matches = procedures.filter((procedure) => normalized(procedure.designator) === value);
    const sidContext = index === 0 || (index === 1 && context.origin && normalized(raw[0] ?? "") === context.origin);
    const starContext = index === raw.length - 1 || (index === raw.length - 2 && context.destination && normalized(raw[raw.length - 1] ?? "") === context.destination);
    const sid = sidContext && matches.some((procedure) => procedure.type === "SID" && context.origin && normalized(procedure.airportIcao) === context.origin);
    const star = starContext && matches.some((procedure) => procedure.type === "STAR" && context.destination && normalized(procedure.airportIcao) === context.destination);
    if (sid) return { type: "SID", value, index };
    if (star) return { type: "STAR", value, index };
    return { type: genericTokenType(value, network), value, index };
  });
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

function sourceForProcedure(procedure: Procedure): RouteElementSource {
  return {
    kind: procedure.type === "SID" ? "PUBLISHED_SID" : "PUBLISHED_STAR",
    provider: procedure.source.provider,
    countryCode: procedure.source.countryCode,
    reference: procedure.source.reference,
    procedureId: procedure.id,
    effectiveDate: procedure.source.effectiveDate,
    airacCycle: procedure.source.airacCycle,
    amendment: procedure.source.amendment,
  };
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

function sourceForFiled(kind: "FILED_DCT" | "SCHEMATIC", filedSource: string | null): RouteElementSource {
  return { kind, provider: filedSource, countryCode: null, reference: null, procedureId: null, effectiveDate: null, airacCycle: null, amendment: null };
}

function point(point: ProcedurePointLike | CzAtsPoint | null): InterpretedRoutePoint | null {
  if (!point) return null;
  if ("coordinates" in point) return { id: point.id, name: point.name, coordinates: point.coordinates ? { ...point.coordinates } : null };
  return { id: point.id, name: point.name, coordinates: finiteCoordinates(point.latitude, point.longitude) ? { lat: point.latitude, lon: point.longitude } : null };
}

interface ProcedurePointLike {
  id: string;
  name: string;
  coordinates: { lat: number; lon: number } | null;
}

function finiteCoordinates(latitude: number | null, longitude: number | null): boolean {
  return latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude);
}

function geometryFromProcedure(procedure: Procedure): InterpretedRouteGeometry | null {
  const coordinates = procedure.legs.flatMap((leg) => {
    if (leg.geometry?.coordinates.length) return leg.geometry.coordinates;
    const from = leg.from?.coordinates;
    const to = leg.to?.coordinates;
    return from && to ? [from, to] : [];
  }).filter((coordinate, index, all) => index === 0 || coordinate.lat !== all[index - 1]?.lat || coordinate.lon !== all[index - 1]?.lon);
  if (!coordinates.length) return null;
  return {
    type: procedure.legs.some((leg) => leg.geometry?.type === "ARC") ? "ARC" : "LINE",
    coordinates,
  };
}

function procedureElement(procedure: Procedure, sequence: number): InterpretedRouteElement {
  const legs = procedure.legs.filter((leg) => leg.type !== "DISCONTINUITY").sort((left, right) => left.sequence - right.sequence);
  const first = legs[0];
  const last = legs[legs.length - 1];
  const hasDiscontinuity = procedure.discontinuities.length > 0 || procedure.legs.some((leg) => leg.type === "DISCONTINUITY");
  return {
    id: `procedure:${procedure.id}`,
    sequence,
    kind: procedure.type === "SID" ? "PUBLISHED_SID" : "PUBLISHED_STAR",
    phase: procedure.type,
    label: procedure.designator,
    from: point(first?.from ?? null),
    to: point(last?.to ?? null),
    geometry: geometryFromProcedure(procedure),
    source: sourceForProcedure(procedure),
    status: hasDiscontinuity ? "DISCONTINUITY" : "RESOLVED",
    unresolvedReason: hasDiscontinuity ? "published procedure discontinuity" : null,
  };
}

function pointFromNetwork(ref: PointRef | null): InterpretedRoutePoint | null {
  return ref ? point(ref.point) : null;
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

function evidence(kind: ProcedureMatchEvidence["kind"], description: string, sourceReference: string | null): ProcedureMatchEvidence {
  return { kind, description, sourceReference };
}

function runwayCompatibility(procedure: Procedure, runway: string | null): ProcedureRunwayCompatibility {
  if (!runway || procedure.runwayApplicability.kind === "UNKNOWN") return "UNKNOWN";
  const runways = procedure.runwayApplicability.runwayDesignators.map(normalized);
  if (procedure.runwayApplicability.kind === "ALL") return "COMPATIBLE";
  const contains = runways.includes(normalized(runway));
  return procedure.runwayApplicability.kind === "INCLUDE" ? (contains ? "COMPATIBLE" : "INCOMPATIBLE") : (contains ? "INCOMPATIBLE" : "COMPATIBLE");
}

function procedureSelection(
  token: V2Token,
  type: "SID" | "STAR",
  airport: string | null,
  procedures: readonly Procedure[],
  runway: string | null,
  adjacentName: string | null,
): ProcedureSelection {
  const candidates = procedures.filter((procedure) =>
    procedure.type === type
      && normalized(procedure.designator) === token.value
      && Boolean(airport && normalized(procedure.airportIcao) === airport));
  const candidateViews: ProcedureCandidate[] = candidates.map((procedure) => {
    const compatibility = runwayCompatibility(procedure, runway);
    const matchesTransition = Boolean(adjacentName && procedure.transition && normalized(procedure.transition) === normalized(adjacentName));
    const candidateEvidence = [
      evidence("FILED_DESIGNATOR", `filed ${type} designator ${token.value}`, procedure.source.reference),
      ...(matchesTransition ? [evidence("TRANSITION", `filed transition ${adjacentName}`, procedure.source.reference)] : []),
      ...(compatibility !== "UNKNOWN" ? [evidence("RUNWAY", `${compatibility.toLowerCase()} runway applicability`, procedure.source.reference)] : []),
    ];
    return {
      procedureId: procedure.id,
      airportIcao: procedure.airportIcao,
      designator: procedure.designator,
      type: procedure.type,
      transition: procedure.transition,
      confidence: Math.min(1, 0.75 + (matchesTransition ? 0.15 : 0) + (compatibility === "COMPATIBLE" ? 0.1 : 0)),
      runwayCompatibility: compatibility,
      evidence: candidateEvidence,
    };
  });
  const usable = candidateViews.filter((candidate) => candidate.runwayCompatibility !== "INCOMPATIBLE");
  const ranked = usable.map((candidate) => ({
    candidate,
    score: (candidate.evidence.some((item) => item.kind === "TRANSITION") ? 2 : 0) + (candidate.runwayCompatibility === "COMPATIBLE" ? 1 : 0),
  })).sort((left, right) => right.score - left.score);
  const topScore = ranked[0]?.score ?? null;
  const top = topScore === null ? [] : ranked.filter((item) => item.score === topScore);
  const selected = top.length === 1 ? candidates.find((procedure) => procedure.id === top[0]!.candidate.procedureId) ?? null : null;
  const selectedView = top[0]?.candidate ?? null;
  const match: ProcedureMatch = {
    status: selected ? "FILED" : "UNRESOLVED",
    selectedProcedureId: selected?.id ?? null,
    candidateCount: candidateViews.length,
    ambiguous: top.length > 1,
    ambiguityReason: top.length > 1 ? "equally suitable procedure candidates" : selected ? null : candidateViews.length ? "no runway-compatible procedure candidate" : "procedure designator is not available for the required airport",
    confidence: selectedView?.confidence ?? null,
    runwayCompatibility: selectedView?.runwayCompatibility ?? (candidateViews.length ? "INCOMPATIBLE" : "UNKNOWN"),
    evidence: selectedView?.evidence ?? [],
    candidates: candidateViews,
  };
  return { procedure: selected, match };
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

function dctElement(startName: string, endName: string, sequence: number, network: RouteIntelligenceNetwork | null, filedSource: string | null): InterpretedRouteElement {
  const start = networkPointCandidates(network, startName);
  const end = networkPointCandidates(network, endName);
  const from = start.length === 1 ? pointFromNetwork(start[0]!) : null;
  const to = end.length === 1 ? pointFromNetwork(end[0]!) : null;
  return {
    id: `dct:${sequence}:${startName}:${endName}`,
    sequence,
    kind: "FILED_DCT",
    phase: "EN_ROUTE",
    label: "DCT",
    from,
    to,
    geometry: lineGeometry(from, to),
    source: sourceForFiled("FILED_DCT", filedSource),
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
  const procedures = options.procedures ?? [];
  const network = options.atsNetwork ?? null;
  if (!fields.text) {
    return { id: "filed:empty", status: "NO_ROUTE", elements: [], procedureMatches: [], sources: [], coverage: { ats: { eligibleLegs: 0, matchedLegs: 0, percent: null }, reconstruction: { totalElements: 0, resolvedElements: 0, percent: null }, progress: null } };
  }
  const context = airportContext(options);
  const runway = createRunwayContext(options.runway);
  const tokens = tokensFor(options, network, procedures);
  const elements: InterpretedRouteElement[] = [];
  const procedureMatches: ProcedureMatch[] = [];
  const elementOrder = new Map<string, number>();
  const handledTokenIndices = new Set<number>();
  let sequence = 1;

  const procedureToken = (type: "SID" | "STAR"): V2Token | null => tokens.find((token) => token.type === type) ?? null;
  const sidToken = procedureToken("SID");
  const starToken = procedureToken("STAR");
  if (sidToken) {
    const selection = procedureSelection(sidToken, "SID", context.origin, procedures, runway.reportedRunway ?? runway.inferredRunway, tokens.find((token) => token.index > sidToken.index && token.type === "WAYPOINT")?.value ?? null);
    procedureMatches.push(selection.match);
    const element = selection.procedure ? procedureElement(selection.procedure, sequence++) : unresolvedElement(sidToken.value, "SID", sequence++, selection.match.ambiguityReason ?? "SID could not be resolved", fields.source);
    elements.push(element);
    elementOrder.set(element.id, sidToken.index);
    handledTokenIndices.add(sidToken.index);
  } else if (tokens[0]?.value && procedures.some((procedure) => normalized(procedure.designator) === tokens[0]!.value)) {
    procedureMatches.push({ status: "UNRESOLVED", selectedProcedureId: null, candidateCount: 0, ambiguous: false, ambiguityReason: "SID requires matching origin airport context", confidence: null, runwayCompatibility: "UNKNOWN", evidence: [], candidates: [] });
    const element = unresolvedElement(tokens[0]!.value, "SID", sequence++, "SID requires matching origin airport context", fields.source);
    elements.push(element);
    elementOrder.set(element.id, tokens[0]!.index);
    handledTokenIndices.add(tokens[0]!.index);
  }
  if (starToken) {
    const selection = procedureSelection(starToken, "STAR", context.destination, procedures, runway.reportedRunway ?? runway.inferredRunway, [...tokens].reverse().find((token) => token.index < starToken.index && token.type === "WAYPOINT")?.value ?? null);
    procedureMatches.push(selection.match);
    // STARs are emitted in route order below when the token is encountered.
    const element = selection.procedure ? procedureElement(selection.procedure, sequence++) : unresolvedElement(starToken.value, "STAR", sequence++, selection.match.ambiguityReason ?? "STAR could not be resolved", fields.source);
    elements.push(element);
    elementOrder.set(element.id, starToken.index);
    handledTokenIndices.add(starToken.index);
  } else if (tokens.at(-1)?.value && procedures.some((procedure) => normalized(procedure.designator) === tokens.at(-1)!.value)) {
    procedureMatches.push({ status: "UNRESOLVED", selectedProcedureId: null, candidateCount: 0, ambiguous: false, ambiguityReason: "STAR requires matching destination airport context", confidence: null, runwayCompatibility: "UNKNOWN", evidence: [], candidates: [] });
    const element = unresolvedElement(tokens.at(-1)!.value, "STAR", sequence++, "STAR requires matching destination airport context", fields.source);
    elements.push(element);
    elementOrder.set(element.id, tokens.at(-1)!.index);
    handledTokenIndices.add(tokens.at(-1)!.index);
  }

  const waypoints = tokens.filter((token) => token.type === "WAYPOINT");
  let atsEligible = 0;
  let atsMatched = 0;
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const left = waypoints[index]!;
    const right = waypoints[index + 1]!;
    const between = tokens.filter((token) => token.index > left.index && token.index < right.index);
    if (between.some((token) => token.type === "UNKNOWN" || token.type === "SID" || token.type === "STAR")) continue;
    const dct = between.some((token) => token.type === "DCT");
    const airways = unique(between.filter((token) => token.type === "AIRWAY").map((token) => token.value));
    if (dct) {
      const element = dctElement(left.value, right.value, sequence++, network, fields.source);
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
      const element = unresolvedElement(`${left.value}-${right.value}`, "CONNECTOR", sequence++, "ATS leg could not be resolved", fields.source);
      elements.push(element);
      elementOrder.set(element.id, left.index + 0.5);
    }
  }

  for (const token of tokens.filter((candidate) => candidate.type === "UNKNOWN" && !handledTokenIndices.has(candidate.index))) {
    const phase: RoutePhase = token.index === 0 ? "SID" : token.index === tokens.length - 1 ? "STAR" : "CONNECTOR";
    const element = unresolvedElement(token.value, phase, sequence++, "route token is not recognized by the loaded static data", fields.source);
    elements.push(element);
    elementOrder.set(element.id, token.index);
  }

  // Keep elements in filed order even though SID/STAR matching is evaluated up front.
  elements.sort((left, right) => {
    const leftIndex = elementOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = elementOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.sequence - right.sequence;
  }).forEach((element, index) => { element.sequence = index + 1; });
  const resolvedElements = elements.filter((element) => element.status === "RESOLVED").length;
  return {
    id: routeId(fields.text),
    status: statusFor(elements, true),
    elements,
    procedureMatches,
    sources: routeSources(elements),
    coverage: {
      ats: { eligibleLegs: atsEligible, matchedLegs: atsMatched, percent: atsEligible ? Math.round((atsMatched / atsEligible) * 100) : null },
      reconstruction: { totalElements: elements.length, resolvedElements, percent: elements.length ? Math.round((resolvedElements / elements.length) * 100) : null },
      progress: null,
    },
  };
}

export function interpretFiledRoute(options: RouteIntelligenceV2Options): InterpretedRoute {
  return staticRoute(options);
}

export function analyzeRouteIntelligenceV2(options: RouteIntelligenceV2Options): RouteIntelligenceV2Snapshot {
  const route = staticRoute(options);
  return {
    route,
    dynamic: {
      currentPhase: "UNKNOWN",
      currentElement: null,
      previousPoint: null,
      nextPoint: null,
      distanceToNext: null,
      crossTrackDeviation: null,
      routeAdherence: "UNKNOWN",
      completedElements: [],
      remainingElements: [],
      routeProgress: null,
    },
    runway: createRunwayContext(options.runway),
  };
}

export const analyzeRouteV2 = analyzeRouteIntelligenceV2;
