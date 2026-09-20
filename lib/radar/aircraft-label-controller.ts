import type { FilterSpecification } from "maplibre-gl";
import type * as maplibregl from "maplibre-gl";
import type { AircraftMarkerHandle } from "@/lib/radar/aircraft-marker-controller";
import { layoutAircraftLabels, type ScreenRect } from "@/lib/radar/aircraft-label-collision";

export interface RouteAirportLabelFeature {
  properties: { icao: string; code: string };
  geometry: { coordinates: [number, number] };
}

export interface AircraftLabelCollisionInput {
  map: maplibregl.Map;
  aircraftMarkers: ReadonlyMap<string, AircraftMarkerHandle>;
  routeAirportFeatures: readonly RouteAirportLabelFeature[];
  routeAirportLabelLayerId: string;
}

/**
 * Reads dimensions in one batch, greedily places DOM aircraft labels, then
 * writes placement/visibility in a second phase. MapLibre-native airport
 * labels remain owned by MapLibre; only the selected-route label layer gets a
 * small exclusion filter when a DOM label occupies its screen rectangle.
 */
export function applyAircraftLabelCollisionLayout(input: AircraftLabelCollisionInput): void {
  const collisionItems = [] as Array<{
    id: string;
    point: { x: number; y: number };
    width: number;
    height: number;
    priority: AircraftMarkerHandle["labelPriority"];
    forceVisible: boolean;
  }>;
  const handleByHex = new Map<string, AircraftMarkerHandle>();
  for (const [hex, handle] of input.aircraftMarkers) {
    if (!handle.labelText || handle.root.style.visibility === "hidden") {
      handle.label.dataset.collisionHidden = "false";
      continue;
    }
    if (handle.labelWidth === null || handle.labelHeight === null) {
      handle.labelWidth = handle.label.offsetWidth;
      handle.labelHeight = handle.label.offsetHeight;
    }
    if (handle.labelWidth <= 0 || handle.labelHeight <= 0) continue;
    const point = input.map.project(handle.marker.getLngLat());
    collisionItems.push({
      id: hex,
      point: { x: point.x, y: point.y },
      width: handle.labelWidth,
      height: handle.labelHeight,
      priority: handle.labelPriority,
      forceVisible: handle.labelPriority === "selected" || handle.labelPriority === "emergency",
    });
    handleByHex.set(hex, handle);
  }

  const result = layoutAircraftLabels(collisionItems);
  const visibleAircraftLabelRects: ScreenRect[] = [];
  for (const [hex, handle] of handleByHex) {
    const placement = result.placements.get(hex);
    const candidate = result.candidates.get(hex)?.find((item) => item.placement === placement);
    if (placement && candidate && !result.hidden.has(hex)) {
      handle.label.dataset.placement = placement;
      handle.label.dataset.collisionHidden = "false";
      visibleAircraftLabelRects.push(candidate.rect);
    } else {
      handle.label.dataset.collisionHidden = "true";
    }
  }

  const hiddenRouteAirports = new Set<string>();
  for (const feature of input.routeAirportFeatures) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = input.map.project([longitude, latitude]);
    const width = Math.max(34, feature.properties.code.length * 7 + 10);
    const rect: ScreenRect = { x: point.x - width / 2, y: point.y + 7, width, height: 16 };
    if (visibleAircraftLabelRects.some((aircraftRect) => intersects(aircraftRect, rect))) {
      hiddenRouteAirports.add(feature.properties.icao);
    }
  }

  if (input.map.getLayer(input.routeAirportLabelLayerId)) {
    const filter: FilterSpecification = hiddenRouteAirports.size
      ? ["all", ["==", ["get", "labelVisible"], true], ["!", ["in", ["get", "icao"], ["literal", [...hiddenRouteAirports]]]]]
      : ["==", ["get", "labelVisible"], true];
    input.map.setFilter(input.routeAirportLabelLayerId, filter);
  }
}

function intersects(left: ScreenRect, right: ScreenRect): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}
