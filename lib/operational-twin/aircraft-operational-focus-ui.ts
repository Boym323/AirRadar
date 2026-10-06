import type { Route } from "next";
import type { FeatureCollection, LineString, Point } from "geojson";
import { interpolateOperationalTwinPoint } from "./map";
import type {
  AircraftOperationalFocusItem,
  AircraftOperationalFocusLevel,
  AircraftOperationalFocusType,
  OperationalTwinSituation,
} from "./types";

export const AIRCRAFT_OPERATIONAL_FOCUS_QUERY_PARAM = "operationalFocus";
export const AIRCRAFT_OPERATIONAL_FOCUS_MAP_SOURCE_ID = "aircraft-operational-focus-map-v1";
export const AIRCRAFT_OPERATIONAL_FOCUS_MAP_LINE_LAYER_ID = "aircraft-operational-focus-map-line-v1";
export const AIRCRAFT_OPERATIONAL_FOCUS_MAP_POINT_LAYER_ID = "aircraft-operational-focus-map-point-v1";

export interface AircraftOperationalFocusMapTarget {
  itemId: string;
  type: AircraftOperationalFocusType;
  level: Exclude<AircraftOperationalFocusLevel, "NORMAL">;
  offsetMinutes: number;
  lat: number;
  lon: number;
}

type FocusMapProperties = {
  kind: "corridor" | "target";
  itemId: string;
  type: AircraftOperationalFocusType;
  level: Exclude<AircraftOperationalFocusLevel, "NORMAL">;
  offsetMinutes: number;
  contextOnly: true;
};

export type AircraftOperationalFocusMapGeoJSON = FeatureCollection<
  LineString | Point,
  FocusMapProperties
>;

function finiteCoordinate(lat: number | null | undefined, lon: number | null | undefined): { lat: number; lon: number } | null {
  if (
    typeof lat !== "number"
    || typeof lon !== "number"
    || !Number.isFinite(lat)
    || !Number.isFinite(lon)
    || lat < -90
    || lat > 90
    || lon < -180
    || lon > 180
  ) return null;
  return { lat, lon };
}

function sourceCoordinate(
  situation: OperationalTwinSituation,
  item: AircraftOperationalFocusItem,
): { lat: number; lon: number } | null {
  if (item.type === "WEATHER") {
    const sourceId = item.id.startsWith("weather:") ? item.id.slice("weather:".length) : "";
    const event = situation.weatherCorridor.events.find((candidate) => candidate.id === sourceId);
    return event ? finiteCoordinate(event.lat, event.lon) : null;
  }

  if (item.type === "NAVIGATION_INTEGRITY") {
    const sourceId = item.id.startsWith("navigation-integrity:")
      ? item.id.slice("navigation-integrity:".length)
      : "";
    const event = situation.navigationIntegrityCorridor?.events.find((candidate) => candidate.id === sourceId);
    return event ? finiteCoordinate(event.lat, event.lon) : null;
  }

  const prefix = item.type === "PLANNED_AIRSPACE" ? "planned-airspace:" : "trajectory:";
  const sourceId = item.id.startsWith(prefix) ? item.id.slice(prefix.length) : "";
  const event = situation.events.find((candidate) => candidate.id === sourceId);
  return event ? finiteCoordinate(event.lat, event.lon) : null;
}

export function aircraftOperationalFocusRadarHref(icaoHex: string, itemId: string): Route {
  const params = new URLSearchParams({
    aircraft: icaoHex.trim().toUpperCase(),
    [AIRCRAFT_OPERATIONAL_FOCUS_QUERY_PARAM]: itemId,
  });
  return `/?${params.toString()}` as Route;
}

export function resolveAircraftOperationalFocusMapTarget(
  situation: OperationalTwinSituation | null,
  itemId: string | null,
): AircraftOperationalFocusMapTarget | null {
  if (!situation || !itemId) return null;
  const item = situation.operationalFocus?.items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  const source = sourceCoordinate(situation, item);
  const interpolated = interpolateOperationalTwinPoint(situation.corridor.points, item.offsetMinutes);
  const coordinate = source ?? (interpolated ? finiteCoordinate(interpolated.lat, interpolated.lon) : null);
  if (!coordinate) return null;
  return {
    itemId: item.id,
    type: item.type,
    level: item.level,
    offsetMinutes: item.offsetMinutes,
    lat: coordinate.lat,
    lon: coordinate.lon,
  };
}

export function emptyAircraftOperationalFocusMapGeoJSON(): AircraftOperationalFocusMapGeoJSON {
  return { type: "FeatureCollection", features: [] };
}

export function createAircraftOperationalFocusMapGeoJSON(
  situation: OperationalTwinSituation | null,
  itemId: string | null,
): AircraftOperationalFocusMapGeoJSON {
  const target = resolveAircraftOperationalFocusMapTarget(situation, itemId);
  if (!situation || !target) return emptyAircraftOperationalFocusMapGeoJSON();

  const properties = {
    itemId: target.itemId,
    type: target.type,
    level: target.level,
    offsetMinutes: target.offsetMinutes,
    contextOnly: true as const,
  };
  const features: AircraftOperationalFocusMapGeoJSON["features"] = [];

  const segment = situation.corridor.points.filter((point) => point.offsetMinutes <= target.offsetMinutes);
  const endpoint = interpolateOperationalTwinPoint(situation.corridor.points, target.offsetMinutes);
  const linePoints = endpoint && segment.at(-1)?.offsetMinutes !== endpoint.offsetMinutes
    ? [...segment, endpoint]
    : segment;
  if (linePoints.length >= 2) {
    features.push({
      type: "Feature",
      properties: { ...properties, kind: "corridor" },
      geometry: {
        type: "LineString",
        coordinates: linePoints.map((point) => [point.lon, point.lat]),
      },
    });
  }

  features.push({
    type: "Feature",
    properties: { ...properties, kind: "target" },
    geometry: { type: "Point", coordinates: [target.lon, target.lat] },
  });

  return { type: "FeatureCollection", features };
}
