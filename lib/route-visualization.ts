import type { FlightRoute } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import type { RouteCoordinate } from "@/lib/route-intelligence/contracts";
import type { RouteIntelligenceViewDTO, RouteElementViewDTO } from "@/lib/route-intelligence/contracts";

export type { RouteCoordinate } from "@/lib/route-intelligence/contracts";

/** MapLibre namespace owned by Route Visualization V2. */
export const ROUTE_V2_SOURCE_ID = "selected-route-v2";
export const ROUTE_V2_COMPLETED_LAYER_ID = "selected-route-completed";
export const ROUTE_V2_REMAINING_LAYER_ID = "selected-route-remaining";
export const ROUTE_V2_AIRPORT_SOURCE_ID = "selected-route-airports-v2";
export const ROUTE_V2_AIRPORT_CIRCLE_LAYER_ID = "selected-route-airports-v2-circle";
export const ROUTE_V2_AIRPORT_LABEL_LAYER_ID = "selected-route-airports-v2-label";
/** These layers reuse the existing `ats-routes` GeoJSON source. */
export const ROUTE_INTELLIGENCE_COMPLETED_LAYER_ID = "ats-route-intelligence-completed";
export const ROUTE_INTELLIGENCE_CURRENT_LAYER_ID = "ats-route-intelligence-current";
export const ROUTE_INTELLIGENCE_REMAINING_LAYER_ID = "ats-route-intelligence-remaining";
export const ROUTE_INTELLIGENCE_SOURCE_ID = "route-intelligence-v2";

export const MAX_ROUTE_POINTS_PER_SEGMENT = 64;

interface RouteAirportFeature {
  type: "Feature";
  properties: {
    role: "origin" | "destination";
    icao: string;
    code: string;
    name: string;
    labelVisible: boolean;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
}

interface RouteSegmentFeature {
  type: "Feature";
  properties: {
    segment: "completed" | "remaining";
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export interface RouteGeoJSON {
  type: "FeatureCollection";
  features: RouteSegmentFeature[];
}

export interface RouteAirportGeoJSON {
  type: "FeatureCollection";
  features: RouteAirportFeature[];
}

export type RouteIntelligenceFeatureProgress = "completed" | "current" | "remaining" | "unresolved";

export interface RouteIntelligenceFeatureProperties {
  elementId: string;
  sequence: number;
  elementKind: RouteElementViewDTO["kind"];
  phase: RouteElementViewDTO["phase"];
  sourceKind: RouteElementViewDTO["source"]["kind"];
  status: RouteElementViewDTO["status"];
  progress: RouteIntelligenceFeatureProgress;
  label: string | null;
  fromName: string | null;
  toName: string | null;
  sourceReference: string | null;
}

export interface RouteIntelligenceFeature {
  type: "Feature";
  properties: RouteIntelligenceFeatureProperties;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export interface RouteIntelligenceGeoJSON {
  type: "FeatureCollection";
  features: RouteIntelligenceFeature[];
}

function isFiniteCoordinate(point: RouteCoordinate): boolean {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lon)
    && point.lat >= -90
    && point.lat <= 90
    && point.lon >= -180
    && point.lon <= 180;
}

function coordinateFromView(point: RouteElementViewDTO["from"]): RouteCoordinate | null {
  if (!point || point.latitude === null || point.longitude === null) return null;
  const candidate = { lat: point.latitude, lon: point.longitude };
  return isFiniteCoordinate(candidate) ? candidate : null;
}

function validLineCoordinates(element: RouteElementViewDTO): [number, number][] {
  const geometry = element.geometry?.coordinates ?? [];
  const coordinates = geometry
    .filter(isFiniteCoordinate)
    .map((point) => [point.lon, point.lat] as [number, number]);
  if (coordinates.length >= 2) return coordinates;

  const from = coordinateFromView(element.from);
  const to = coordinateFromView(element.to);
  const mayUseEndpointConnector = element.source.kind === "FILED_DCT"
    || element.source.kind === "FILED_ROUTE"
    || element.source.kind === "SCHEMATIC";
  if (mayUseEndpointConnector && from && to && (from.lat !== to.lat || from.lon !== to.lon)) {
    return [[from.lon, from.lat], [to.lon, to.lat]];
  }
  return [];
}

function featureProgress(route: RouteIntelligenceViewDTO, element: RouteElementViewDTO): RouteIntelligenceFeatureProgress {
  if (element.status !== "RESOLVED") return "unresolved";
  if (element.id === route.currentElement?.id) return "current";
  if (route.completedElementIds.includes(element.id)) return "completed";
  return "remaining";
}

/**
 * Converts the browser contract into safe, semantic GeoJSON for MapLibre.
 * Missing or malformed geometry is omitted unless the source explicitly
 * describes a direct/filed or schematic connector. No inferred procedure
 * line is emitted from endpoints of a published procedure.
 */
export function createRouteIntelligenceGeoJSON(
  route: RouteIntelligenceViewDTO | null | undefined,
): RouteIntelligenceGeoJSON {
  const features: RouteIntelligenceFeature[] = [];
  if (!route) return { type: "FeatureCollection", features };

  for (const element of route.elements) {
    const coordinates = validLineCoordinates(element);
    if (coordinates.length < 2) continue;
    features.push({
      type: "Feature",
      properties: {
        elementId: element.id,
        sequence: element.sequence,
        elementKind: element.kind,
        phase: element.phase,
        sourceKind: element.source.kind,
        status: element.status,
        progress: featureProgress(route, element),
        label: element.label,
        fromName: element.from?.name ?? null,
        toName: element.to?.name ?? null,
        sourceReference: element.source.reference,
      },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}

export function emptyRouteIntelligenceGeoJSON(): RouteIntelligenceGeoJSON {
  return { type: "FeatureCollection", features: [] };
}

function toUnitVector(point: RouteCoordinate): [number, number, number] {
  const latitude = (point.lat * Math.PI) / 180;
  const longitude = (point.lon * Math.PI) / 180;
  const cosLatitude = Math.cos(latitude);
  return [
    cosLatitude * Math.cos(longitude),
    cosLatitude * Math.sin(longitude),
    Math.sin(latitude),
  ];
}

function normalizeVector(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...vector);
  return length === 0 ? [1, 0, 0] : [vector[0] / length, vector[1] / length, vector[2] / length];
}

function crossProduct(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function pointFromUnitVector(vector: [number, number, number]): RouteCoordinate {
  return {
    lat: (Math.atan2(vector[2], Math.hypot(vector[0], vector[1])) * 180) / Math.PI,
    lon: (Math.atan2(vector[1], vector[0]) * 180) / Math.PI,
  };
}

function unwrapLongitude(longitude: number, reference: number): number {
  let unwrapped = longitude;
  while (unwrapped - reference > 180) unwrapped -= 360;
  while (unwrapped - reference < -180) unwrapped += 360;
  return unwrapped;
}

function boundedPointCount(maxPoints: number): number {
  if (!Number.isFinite(maxPoints)) return MAX_ROUTE_POINTS_PER_SEGMENT;
  return Math.min(MAX_ROUTE_POINTS_PER_SEGMENT, Math.max(2, Math.floor(maxPoints)));
}

/**
 * Interpolate the shortest great-circle arc. Longitudes are deliberately
 * unwrapped around the first point so a dateline crossing remains a short
 * segment for MapLibre instead of becoming a line across the whole map.
 */
export function interpolateGreatCircle(
  from: RouteCoordinate,
  to: RouteCoordinate,
  maxPoints = MAX_ROUTE_POINTS_PER_SEGMENT,
): [number, number][] {
  if (!isFiniteCoordinate(from) || !isFiniteCoordinate(to)) return [];

  const fromVector = toUnitVector(from);
  const toVector = toUnitVector(to);
  const dot = Math.max(-1, Math.min(1, fromVector[0] * toVector[0] + fromVector[1] * toVector[1] + fromVector[2] * toVector[2]));
  const angularDistance = Math.acos(dot);
  const pointCount = boundedPointCount(maxPoints);
  if (angularDistance < 1e-10) return [[from.lon, from.lat], [to.lon, to.lat]];

  const steps = Math.min(pointCount - 1, Math.max(1, Math.ceil(angularDistance / (Math.PI / 90))));
  const coordinates: [number, number][] = [];
  const sineDistance = Math.sin(angularDistance);
  let oppositeArcDirection: [number, number, number] | null = null;
  if (Math.abs(sineDistance) < 1e-8) {
    const reference: [number, number, number] = Math.abs(fromVector[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    oppositeArcDirection = normalizeVector(crossProduct(reference, fromVector));
  }

  for (let index = 0; index <= steps; index += 1) {
    if (index === 0) {
      coordinates.push([from.lon, from.lat]);
      continue;
    }
    if (index === steps) {
      coordinates.push([unwrapLongitude(to.lon, from.lon), to.lat]);
      continue;
    }

    const fraction = index / steps;
    const vector = oppositeArcDirection
      ? normalizeVector([
        fromVector[0] * Math.cos(Math.PI * fraction) + oppositeArcDirection[0] * Math.sin(Math.PI * fraction),
        fromVector[1] * Math.cos(Math.PI * fraction) + oppositeArcDirection[1] * Math.sin(Math.PI * fraction),
        fromVector[2] * Math.cos(Math.PI * fraction) + oppositeArcDirection[2] * Math.sin(Math.PI * fraction),
      ])
      : normalizeVector([
        (Math.sin((1 - fraction) * angularDistance) / sineDistance) * fromVector[0] + (Math.sin(fraction * angularDistance) / sineDistance) * toVector[0],
        (Math.sin((1 - fraction) * angularDistance) / sineDistance) * fromVector[1] + (Math.sin(fraction * angularDistance) / sineDistance) * toVector[1],
        (Math.sin((1 - fraction) * angularDistance) / sineDistance) * fromVector[2] + (Math.sin(fraction * angularDistance) / sineDistance) * toVector[2],
      ]);
    const point = pointFromUnitVector(vector);
    coordinates.push([unwrapLongitude(point.lon, from.lon), point.lat]);
  }
  return coordinates;
}

function airportCoordinate(airport: Airport | null | undefined): RouteCoordinate | null {
  if (!airport) return null;
  const point = { lat: airport.latitude, lon: airport.longitude };
  return isFiniteCoordinate(point) ? point : null;
}

function canonicalIcao(airport: Airport): string | null {
  const icao = airport.icaoCode.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(icao) ? icao : null;
}

function airportLabel(airport: Airport, icao: string): string {
  return airport.iataCode?.trim()
    ? `${airport.iataCode.trim().toUpperCase()} · ${icao}`
    : icao;
}

export function createRouteGeoJSON(
  route: FlightRoute | null | undefined,
  current: RouteCoordinate | null | undefined,
): RouteGeoJSON {
  const features: RouteSegmentFeature[] = [];
  if (!route || !current || !isFiniteCoordinate(current)) return { type: "FeatureCollection", features };

  const currentPoint = current;
  const origin = airportCoordinate(route.originAirport);
  const destination = airportCoordinate(route.destinationAirport);
  if (origin) {
    const coordinates = interpolateGreatCircle(origin, currentPoint);
    if (coordinates.length > 1) features.push({
      type: "Feature",
      properties: { segment: "completed" },
      geometry: { type: "LineString", coordinates },
    });
  }
  if (destination) {
    const coordinates = interpolateGreatCircle(currentPoint, destination);
    if (coordinates.length > 1) features.push({
      type: "Feature",
      properties: { segment: "remaining" },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}

export function createRouteAirportGeoJSON(
  route: FlightRoute | null | undefined,
  hiddenLabelIcaos: ReadonlySet<string> = new Set(),
): RouteAirportGeoJSON {
  const features: RouteAirportFeature[] = [];
  if (!route) return { type: "FeatureCollection", features };

  const airports: Array<{ role: "origin" | "destination"; airport: Airport | null }> = [
    { role: "origin", airport: route.originAirport },
    { role: "destination", airport: route.destinationAirport },
  ];
  const seen = new Set<string>();
  for (const { role, airport } of airports) {
    if (!airport || !airportCoordinate(airport)) continue;
    const icao = canonicalIcao(airport);
    if (!icao || seen.has(icao)) continue;
    seen.add(icao);
    features.push({
      type: "Feature",
      properties: { role, icao, code: airportLabel(airport, icao), name: airport.name, labelVisible: !hiddenLabelIcaos.has(icao) },
      geometry: { type: "Point", coordinates: [airport.longitude, airport.latitude] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function emptyRouteGeoJSON(): RouteGeoJSON {
  return { type: "FeatureCollection", features: [] };
}

export function emptyRouteAirportGeoJSON(): RouteAirportGeoJSON {
  return { type: "FeatureCollection", features: [] };
}
