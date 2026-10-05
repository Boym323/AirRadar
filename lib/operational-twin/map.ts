import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type {
  OperationalTwinSituation,
  OperationalTwinTrajectoryPoint,
} from "@/lib/operational-twin/types";

export const OPERATIONAL_TWIN_MAP_SOURCE_ID = "operational-twin-v2";
export const OPERATIONAL_TWIN_UNCERTAINTY_LAYER_ID = "operational-twin-v2-uncertainty";
export const OPERATIONAL_TWIN_ROUTE_LAYER_ID = "operational-twin-v2-route";
export const OPERATIONAL_TWIN_KINEMATIC_LAYER_ID = "operational-twin-v2-kinematic";
export const OPERATIONAL_TWIN_MILESTONE_LAYER_ID = "operational-twin-v2-milestones";
export const OPERATIONAL_TWIN_MILESTONE_LABEL_LAYER_ID = "operational-twin-v2-milestone-labels";
export const OPERATIONAL_TWIN_EVENT_LAYER_ID = "operational-twin-v2-events";
export const OPERATIONAL_TWIN_WEATHER_EVENT_LAYER_ID = "operational-twin-v2-weather-events";

export const OPERATIONAL_TWIN_MAP_MILESTONES_MINUTES = [5, 10, 15, 20, 30] as const;

type TwinMapProperties = Record<string, string | number | boolean | null>;

const EARTH_RADIUS_NM = 3440.065;

function radians(value: number): number {
  return value * Math.PI / 180;
}

function degrees(value: number): number {
  return value * 180 / Math.PI;
}

function normalizeLongitude(value: number): number {
  let result = value;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return result;
}

function destinationPoint(
  point: { lat: number; lon: number },
  bearingDeg: number,
  distanceNm: number,
): [number, number] {
  const angular = Math.max(0, distanceNm) / EARTH_RADIUS_NM;
  const bearing = radians(bearingDeg);
  const lat1 = radians(point.lat);
  const lon1 = radians(point.lon);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular)
    + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  return [normalizeLongitude(degrees(lon2)), degrees(lat2)];
}

function initialBearing(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const deltaLon = radians(to.lon - from.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function pointTrack(
  points: readonly OperationalTwinTrajectoryPoint[],
  index: number,
): number {
  const point = points[index]!;
  if (point.trackDeg !== null && Number.isFinite(point.trackDeg)) return point.trackDeg;
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  if (previous === next) return 0;
  return initialBearing(previous, next);
}

function uncertaintyPolygon(
  points: readonly OperationalTwinTrajectoryPoint[],
): Position[][] | null {
  if (points.length < 2 || !points.some((point) => point.uncertaintyNm > 0)) return null;
  const left = points.map((point, index) =>
    destinationPoint(point, pointTrack(points, index) - 90, point.uncertaintyNm));
  const right = points.map((point, index) =>
    destinationPoint(point, pointTrack(points, index) + 90, point.uncertaintyNm)).reverse();
  const ring = [...left, ...right, left[0]!];
  return [ring];
}

function interpolateLongitude(left: number, right: number, ratio: number): number {
  let delta = right - left;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return normalizeLongitude(left + delta * ratio);
}

export function interpolateOperationalTwinPoint(
  points: readonly OperationalTwinTrajectoryPoint[],
  offsetMinutes: number,
): OperationalTwinTrajectoryPoint | null {
  if (!points.length || offsetMinutes < points[0]!.offsetMinutes || offsetMinutes > points.at(-1)!.offsetMinutes) {
    return null;
  }
  const exact = points.find((point) => point.offsetMinutes === offsetMinutes);
  if (exact) return exact;
  const upperIndex = points.findIndex((point) => point.offsetMinutes > offsetMinutes);
  if (upperIndex <= 0) return null;
  const lower = points[upperIndex - 1]!;
  const upper = points[upperIndex]!;
  const span = upper.offsetMinutes - lower.offsetMinutes;
  if (span <= 0) return lower;
  const ratio = (offsetMinutes - lower.offsetMinutes) / span;
  const atMs = Date.parse(lower.at) + (Date.parse(upper.at) - Date.parse(lower.at)) * ratio;
  const altitudeFt = lower.altitudeFt === null || upper.altitudeFt === null
    ? lower.altitudeFt ?? upper.altitudeFt
    : lower.altitudeFt + (upper.altitudeFt - lower.altitudeFt) * ratio;
  return {
    offsetMinutes,
    at: Number.isFinite(atMs) ? new Date(atMs).toISOString() : lower.at,
    lat: lower.lat + (upper.lat - lower.lat) * ratio,
    lon: interpolateLongitude(lower.lon, upper.lon, ratio),
    altitudeFt,
    trackDeg: lower.trackDeg ?? upper.trackDeg,
    uncertaintyNm: lower.uncertaintyNm + (upper.uncertaintyNm - lower.uncertaintyNm) * ratio,
    mode: lower.mode,
  };
}

function feature(
  geometry: Geometry,
  properties: TwinMapProperties,
): Feature<Geometry, TwinMapProperties> {
  return { type: "Feature", geometry, properties };
}

export function emptyOperationalTwinMapGeoJSON(): FeatureCollection<Geometry, TwinMapProperties> {
  return { type: "FeatureCollection", features: [] };
}

export function createOperationalTwinMapGeoJSON(
  situation: OperationalTwinSituation | null,
): FeatureCollection<Geometry, TwinMapProperties> {
  if (!situation || situation.corridor.points.length < 2) return emptyOperationalTwinMapGeoJSON();

  const points = situation.corridor.points;
  const features: Array<Feature<Geometry, TwinMapProperties>> = [];
  const uncertainty = uncertaintyPolygon(points);
  if (uncertainty) {
    features.push(feature(
      { type: "Polygon", coordinates: uncertainty },
      {
        kind: "uncertainty",
        mode: situation.corridor.mode,
        maxUncertaintyNm: situation.corridor.maxUncertaintyNm,
      },
    ));
  }

  features.push(feature(
    {
      type: "LineString",
      coordinates: points.map((point) => [point.lon, point.lat]),
    },
    {
      kind: "corridor",
      mode: situation.corridor.mode,
      horizonMinutes: situation.corridor.horizonMinutes,
      routePrecision: situation.corridor.routePrecision,
    },
  ));

  for (const offsetMinutes of OPERATIONAL_TWIN_MAP_MILESTONES_MINUTES) {
    const point = interpolateOperationalTwinPoint(points, offsetMinutes);
    if (!point) continue;
    features.push(feature(
      { type: "Point", coordinates: [point.lon, point.lat] },
      {
        kind: "milestone",
        label: `+${offsetMinutes} min`,
        offsetMinutes,
        altitudeFt: point.altitudeFt,
        uncertaintyNm: Number(point.uncertaintyNm.toFixed(1)),
      },
    ));
  }

  for (const event of situation.events) {
    if (event.lat === null || event.lon === null) continue;
    features.push(feature(
      { type: "Point", coordinates: [event.lon, event.lat] },
      {
        kind: "event",
        eventType: event.type,
        title: event.title,
        detail: event.detail,
        offsetMinutes: event.offsetMinutes,
        provenance: event.provenance,
        confidence: event.confidence,
        source: event.source,
        altitudeFt: event.altitudeFt,
      },
    ));
  }

  for (const event of situation.weatherCorridor.events) {
    features.push(feature(
      { type: "Point", coordinates: [event.lon, event.lat] },
      {
        kind: "weather-event",
        eventType: event.type,
        title: event.risk,
        detail: event.sourceReference,
        offsetMinutes: event.offsetMinutes,
        severity: event.severity,
        confidence: event.confidence,
        source: event.source,
        altitudeFt: event.altitudeFt,
      },
    ));
  }

  return { type: "FeatureCollection", features };
}
