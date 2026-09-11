import { haversineDistanceKm } from "@/lib/geo";
import {
  DEFAULT_MAX_XTRACK_NM,
  analyzePublishedRoute as analyzePublishedRouteBase,
  analyzePublishedRouteStatic as analyzePublishedRouteStaticBase,
  clearRouteIntelligenceCache as clearRouteIntelligenceCacheBase,
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
} from "./route-intelligence/index";

export { DEFAULT_MAX_XTRACK_NM, tokenizeRoute };
export type {
  AircraftPositionInput,
  AircraftRouteInput,
  MatchedAtsSegment,
  MatchedWaypoint,
  RouteIntelligenceNetwork,
  RouteIntelligenceResult,
  RouteToken,
  RouteTokenType,
};

type AnalyzeOptions = Parameters<typeof analyzePublishedRouteBase>[0];
type StaticAnalyzeOptions = Parameters<typeof analyzePublishedRouteStaticBase>[0];

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
  // Never expose the base engine's cached result object directly: the client-side
  // ATS loader upgrades pending results in place once the dataset arrives.
  return {
    ...corrected,
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

  return clientAtsLoadPromise;
}

export function analyzePublishedRouteStatic(options: StaticAnalyzeOptions): RouteIntelligenceResult {
  const network = options.atsNetwork ?? clientAtsNetwork;
  if (!network && canLoadClientAtsNetwork()) void ensureRouteIntelligenceAtsNetwork();
  return withRequestSource(
    analyzePublishedRouteStaticBase({ ...options, atsNetwork: network }),
    options.aircraftRoute,
  );
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
