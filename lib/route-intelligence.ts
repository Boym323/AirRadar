import { haversineDistanceKm } from "@/lib/geo";
import type { FlightRoute } from "@/lib/aircraft/types";
import {
  DEFAULT_MAX_XTRACK_NM,
  analyzePublishedRoute as analyzePublishedRouteBase,
  analyzePublishedRouteStatic as analyzePublishedRouteStaticBase,
  analyzeRouteIntelligenceV2,
  analyzeRouteV2,
  clearRouteIntelligenceCache as clearRouteIntelligenceCacheBase,
  interpretFiledRoute,
  tokenizeRoute,
} from "./route-intelligence/index";
import type {
  AircraftPositionInput,
  AircraftRouteInput,
  MatchedAtsSegment,
  MatchedWaypoint,
  RouteIntelligenceNetwork,
  RouteIntelligenceResult,
  RouteToken,
  RouteTokenType,
  RouteIntelligenceV2Options,
} from "./route-intelligence/index";
import type {
  InterpretedRouteElement,
  InterpretedRouteGeometry,
  RouteElementViewDTO,
  RouteIntelligenceViewDTO,
  RoutePointViewDTO,
  RouteElementSourceViewDTO,
  RouteIntelligenceV2Snapshot,
} from "./route-intelligence/contracts";

export { DEFAULT_MAX_XTRACK_NM, tokenizeRoute };
export { analyzeRouteIntelligenceV2, analyzeRouteV2, interpretFiledRoute };
export type {
  AircraftPositionInput,
  AircraftRouteInput,
  MatchedAtsSegment,
  MatchedWaypoint,
  RouteIntelligenceNetwork,
  RouteIntelligenceResult,
  RouteToken,
  RouteTokenType,
  RouteIntelligenceV2Options,
};

function viewPoint(point: { id: string; name: string; coordinates?: { lat: number; lon: number } | null } | null): RoutePointViewDTO | null {
  if (!point) return null;
  return {
    id: point.id,
    name: point.name,
    latitude: point.coordinates?.lat ?? null,
    longitude: point.coordinates?.lon ?? null,
  };
}

function viewSource(source: { kind: RouteElementSourceViewDTO["kind"]; provider: string | null; countryCode: string | null; reference: string | null; procedureId: string | null; effectiveDate: string | null; airacCycle: string | null; amendment: string | null }): RouteElementSourceViewDTO {
  return { ...source };
}

function viewElement(element: InterpretedRouteElement): RouteElementViewDTO {
  const geometry: InterpretedRouteGeometry | null = element.geometry
    ? { type: element.geometry.type, coordinates: element.geometry.coordinates.map((point) => ({ lat: point.lat, lon: point.lon })) }
    : null;
  return {
    id: element.id,
    sequence: element.sequence,
    kind: element.kind,
    phase: element.phase,
    label: element.label,
    from: viewPoint(element.from ? { ...element.from, coordinates: element.from.coordinates } : null),
    to: viewPoint(element.to ? { ...element.to, coordinates: element.to.coordinates } : null),
    geometry,
    source: viewSource(element.source),
    status: element.status,
    unresolvedReason: element.unresolvedReason,
  };
}

function viewFromSnapshot(snapshot: RouteIntelligenceV2Snapshot): RouteIntelligenceViewDTO {
  const currentElement = snapshot.dynamic.currentElement ? viewElement(snapshot.dynamic.currentElement) : null;
  return {
    routeId: snapshot.route.id,
    status: snapshot.route.status,
    currentPhase: snapshot.dynamic.currentPhase,
    elements: snapshot.route.elements.map(viewElement),
    currentElement,
    previousPoint: viewPoint(snapshot.dynamic.previousPoint ? { ...snapshot.dynamic.previousPoint, coordinates: snapshot.dynamic.previousPoint.coordinates } : null),
    nextPoint: viewPoint(snapshot.dynamic.nextPoint ? { ...snapshot.dynamic.nextPoint, coordinates: snapshot.dynamic.nextPoint.coordinates } : null),
    distanceToNext: snapshot.dynamic.distanceToNext,
    crossTrackDeviation: snapshot.dynamic.crossTrackDeviation,
    routeAdherence: snapshot.dynamic.routeAdherence,
    completedElementIds: [...snapshot.dynamic.completedElements],
    remainingElementIds: [...snapshot.dynamic.remainingElements],
    routeProgress: snapshot.dynamic.routeProgress,
    coverage: snapshot.route.coverage,
    procedureMatches: snapshot.route.procedureMatches.map((match) => ({
      status: match.status,
      selectedProcedureId: match.selectedProcedureId,
      candidateCount: match.candidateCount,
      ambiguous: match.ambiguous,
      confidence: match.confidence,
      runwayCompatibility: match.runwayCompatibility,
    })),
    runway: snapshot.runway,
  };
}

/**
 * Provides the UI with the shared V2 contract while the legacy matcher is
 * still the live producer. When Agent A's V2 snapshot is present it is used
 * without reshaping or duplicating that browser DTO.
 */
export function toRouteIntelligenceViewDTO(result: RouteIntelligenceResult | null | undefined, route?: FlightRoute | null): RouteIntelligenceViewDTO | null {
  if (!result) return null;
  if (result.v2) return viewFromSnapshot(result.v2);

  const sourceBase: RouteElementSourceViewDTO = {
    kind: "PUBLISHED_ATS",
    provider: result.source.atsName,
    countryCode: null,
    reference: result.source.atsReference,
    procedureId: null,
    effectiveDate: result.source.atsEffectiveDate,
    airacCycle: null,
    amendment: null,
  };
  const elements: RouteElementViewDTO[] = result.matchedSegments.map((segment, index) => ({
    id: segment.segmentId,
    sequence: index + 1,
    kind: "PUBLISHED_ATS",
    phase: "EN_ROUTE",
    label: segment.routeDesignator,
    from: { id: `${segment.segmentId}:from`, name: segment.fromName, latitude: segment.from[1], longitude: segment.from[0] },
    to: { id: `${segment.segmentId}:to`, name: segment.toName, latitude: segment.to[1], longitude: segment.to[0] },
    geometry: { type: "LINE", coordinates: segment.direction === "REVERSE"
      ? [{ lat: segment.from[1], lon: segment.from[0] }, { lat: segment.to[1], lon: segment.to[0] }]
      : [{ lat: segment.from[1], lon: segment.from[0] }, { lat: segment.to[1], lon: segment.to[0] }] },
    source: viewSource(sourceBase),
    status: "RESOLVED",
    unresolvedReason: null,
  }));
  const currentElement = result.currentSegment ? elements.find((element) => element.id === result.currentSegment?.segmentId) ?? null : null;
  const matched = elements.length;
  const percent = result.routeCoveragePercent;
  const eligibleLegs = percent === null ? 0 : Math.max(matched, Math.round(matched * 100 / Math.max(1, percent)));
  const completedElementIds = [...result.progress.completedSegmentIds];
  const remainingElementIds = [...result.progress.remainingSegmentIds];
  const progress = currentElement || completedElementIds.length || remainingElementIds.length
    ? (matched > 0 ? completedElementIds.length / matched : null)
    : null;
  // The legacy payload has no runway evidence. Do not turn airport metadata
  // into an inferred runway; V2 runway producers may populate the contract.
  const inferredRunway = null;
  return {
    routeId: `legacy:${route?.callsign ?? "unknown"}`,
    status: result.status === "MATCHED" ? "RESOLVED" : result.status === "NO_ROUTE" ? "NO_ROUTE" : result.status === "NO_ATS_DATA" ? "UNRESOLVED" : result.status,
    currentPhase: currentElement?.phase ?? "UNKNOWN",
    elements,
    currentElement,
    previousPoint: result.previousWaypoint ? { id: result.previousWaypoint.pointId, name: result.previousWaypoint.name, latitude: result.previousWaypoint.latitude, longitude: result.previousWaypoint.longitude } : null,
    nextPoint: result.nextWaypoint ? { id: result.nextWaypoint.pointId, name: result.nextWaypoint.name, latitude: result.nextWaypoint.latitude, longitude: result.nextWaypoint.longitude } : null,
    distanceToNext: result.distanceToNextWaypointNm,
    crossTrackDeviation: result.crossTrackDeviationNm,
    routeAdherence: result.crossTrackDeviationNm === null ? "UNKNOWN" : result.crossTrackDeviationNm <= 2 ? "ON_ROUTE" : result.crossTrackDeviationNm <= 10 ? "NEAR_ROUTE" : "OFF_ROUTE",
    completedElementIds,
    remainingElementIds,
    routeProgress: progress,
    coverage: {
      ats: { eligibleLegs, matchedLegs: result.matchedSegments.length, percent },
      reconstruction: { totalElements: elements.length, resolvedElements: elements.length, percent: elements.length ? 100 : null },
      progress: matched ? { totalElements: matched, completedElements: completedElementIds.length, percent: progress === null ? null : Math.round(progress * 100) } : null,
    },
    procedureMatches: [],
    runway: { reportedRunway: null, inferredRunway, status: inferredRunway ? "INFERRED" : "UNKNOWN", conflict: false },
  };
}
export type * from "./route-intelligence/contracts";
export { createRunwayContext, hasRunwayConflict } from "./route-intelligence/contracts";

type AnalyzeOptions = Parameters<typeof analyzePublishedRouteBase>[0] & Omit<RouteIntelligenceV2Options, "aircraftRoute" | "atsNetwork">;
type StaticAnalyzeOptions = Parameters<typeof analyzePublishedRouteStaticBase>[0] & Omit<RouteIntelligenceV2Options, "aircraftRoute" | "atsNetwork">;

type AtsRoutesApiResponse = {
  available?: boolean;
  source?: RouteIntelligenceNetwork["source"];
  routes?: RouteIntelligenceNetwork["routes"];
};

let clientAtsNetwork: RouteIntelligenceNetwork | null = null;
let clientAtsLoadPromise: Promise<RouteIntelligenceNetwork | null> | null = null;
let updateVersion = 0;
const updateListeners = new Set<() => void>();
const pendingResults = new Set<{ target: RouteIntelligenceResult; options: AnalyzeOptions }>();

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function aircraftRouteSource(input: AnalyzeOptions["aircraftRoute"]): string | null {
  if (!input) return null;
  const candidate = input as AircraftRouteInput;
  return candidate.flightPlan?.source?.trim()
    || candidate.source?.trim()
    || candidate.route?.source?.trim()
    || null;
}

function withRequestSource(result: RouteIntelligenceResult, input: AnalyzeOptions["aircraftRoute"]): RouteIntelligenceResult {
  const source = aircraftRouteSource(input);
  if (result.source.aircraftRouteSource === source) return result;
  return {
    ...result,
    source: {
      ...result.source,
      aircraftRouteSource: source,
    },
  };
}

function endpointWaypoint(
  result: RouteIntelligenceResult,
  network: RouteIntelligenceNetwork | null,
  segment: MatchedAtsSegment,
  endpoint: "from" | "to",
  matchedSegmentIndex: number,
): MatchedWaypoint {
  const name = endpoint === "from" ? segment.fromName : segment.toName;
  const coordinates = endpoint === "from" ? segment.from : segment.to;
  const existing = result.matchedWaypoints.find((waypoint) => normalized(waypoint.name) === normalized(name));
  if (existing) return existing;

  const route = network?.routes.find((candidate) => normalized(candidate.designator) === normalized(segment.routeDesignator));
  const points = route?.points.filter((point) => normalized(point.name) === normalized(name)) ?? [];
  const point = points.length === 1 ? points[0] : null;

  return {
    routeToken: name,
    tokenIndex: matchedSegmentIndex,
    pointId: point?.id ?? `${segment.routeDesignator}:${name}`,
    name: point?.name ?? name,
    latitude: point?.latitude ?? coordinates[1],
    longitude: point?.longitude ?? coordinates[0],
    confidence: segment.confidence,
  };
}

function correctSegmentProgress(
  result: RouteIntelligenceResult,
  position: AircraftPositionInput | null | undefined,
  network: RouteIntelligenceNetwork | null,
): RouteIntelligenceResult {
  const current = result.currentSegment;
  if (!current) return result;

  const currentIndex = result.matchedSegments.findIndex((segment) =>
    segment.segmentId === current.segmentId
    && segment.routeLegIndex === current.routeLegIndex
    && segment.direction === current.direction
    && normalized(segment.fromName) === normalized(current.fromName)
    && normalized(segment.toName) === normalized(current.toName));
  if (currentIndex < 0) return result;

  const currentSegment = result.matchedSegments[currentIndex] ?? current;
  const previousWaypoint = endpointWaypoint(result, network, currentSegment, "from", currentIndex);
  const nextWaypoint = endpointWaypoint(result, network, currentSegment, "to", currentIndex + 1);
  const distanceToNextWaypointNm = finite(position?.lat) && finite(position?.lon)
    ? haversineDistanceKm(position.lat, position.lon, nextWaypoint.latitude, nextWaypoint.longitude) / 1.852
    : null;

  return {
    ...result,
    currentSegment,
    previousWaypoint,
    nextWaypoint,
    distanceToNextWaypointNm,
    progress: {
      completedSegmentIds: result.matchedSegments.slice(0, currentIndex).map((segment) => segment.segmentId),
      currentSegmentId: currentSegment.segmentId,
      remainingSegmentIds: result.matchedSegments.slice(currentIndex + 1).map((segment) => segment.segmentId),
    },
  };
}

function analyzeWithNetwork(options: AnalyzeOptions, network: RouteIntelligenceNetwork | null): RouteIntelligenceResult {
  const result = analyzePublishedRouteBase({ ...options, atsNetwork: network });
  const corrected = correctSegmentProgress(withRequestSource(result, options.aircraftRoute), options.aircraftPosition, network);
  const v2 = analyzeRouteIntelligenceV2({ ...options, atsNetwork: network });
  // Never expose the base engine's cached result object directly: the client-side
  // ATS loader upgrades pending results in place once the dataset arrives.
  return {
    ...corrected,
    v2,
    source: { ...corrected.source },
    progress: { ...corrected.progress },
  };
}

function publishUpdate(): void {
  updateVersion += 1;
  for (const listener of updateListeners) listener();
}

function canLoadClientAtsNetwork(): boolean {
  return typeof window !== "undefined" && typeof fetch === "function";
}

export function subscribeRouteIntelligenceUpdates(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

export function getRouteIntelligenceUpdateSnapshot(): number {
  return updateVersion;
}

export function ensureRouteIntelligenceAtsNetwork(): Promise<RouteIntelligenceNetwork | null> {
  if (clientAtsNetwork) return Promise.resolve(clientAtsNetwork);
  if (clientAtsLoadPromise) return clientAtsLoadPromise;
  if (!canLoadClientAtsNetwork()) return Promise.resolve(null);

  clientAtsLoadPromise = fetch("/api/ats/routes", { cache: "force-cache" })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json() as AtsRoutesApiResponse;
      if (data.available !== true || !data.source || !Array.isArray(data.routes)) return null;
      return { source: data.source, routes: data.routes };
    })
    .catch(() => null)
    .then((network) => {
      if (!network) {
        pendingResults.clear();
        return null;
      }

      clientAtsNetwork = network;
      for (const pending of pendingResults) {
        Object.assign(pending.target, analyzeWithNetwork({ ...pending.options, atsNetwork: network }, network));
      }
      pendingResults.clear();
      publishUpdate();
      return network;
    });

  // A transient fetch failure must not poison the client for the whole page
  // session. Successful loads are still cached by clientAtsNetwork.
  void clientAtsLoadPromise.then(
    () => { clientAtsLoadPromise = null; },
    () => { clientAtsLoadPromise = null; },
  );
  return clientAtsLoadPromise;
}

export function analyzePublishedRouteStatic(options: StaticAnalyzeOptions): RouteIntelligenceResult {
  const network = options.atsNetwork ?? clientAtsNetwork;
  if (!network && canLoadClientAtsNetwork()) void ensureRouteIntelligenceAtsNetwork();
  const result = withRequestSource(
    analyzePublishedRouteStaticBase({ ...options, atsNetwork: network }),
    options.aircraftRoute,
  );
  return { ...result, v2: analyzeRouteIntelligenceV2({ ...options, atsNetwork: network }) };
}

export function analyzePublishedRoute(options: AnalyzeOptions): RouteIntelligenceResult {
  const network = options.atsNetwork ?? clientAtsNetwork;
  const result = analyzeWithNetwork({ ...options, atsNetwork: network }, network);

  if (!network && canLoadClientAtsNetwork()) {
    pendingResults.add({ target: result, options });
    void ensureRouteIntelligenceAtsNetwork();
  }

  return result;
}

export function clearRouteIntelligenceCache(): void {
  clearRouteIntelligenceCacheBase();
  clientAtsNetwork = null;
  clientAtsLoadPromise = null;
  pendingResults.clear();
  updateVersion = 0;
}
