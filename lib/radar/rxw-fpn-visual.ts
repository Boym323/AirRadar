import type { FeatureCollection, Feature, Point, LineString } from "geojson";
import type { RxwWaypointAvailability, RxwWaypointPlan } from "@/lib/aircraft/rxw-communications";

export const RXW_FPN_BADGE_SOURCE = "rxw-fpn-aircraft";
export const RXW_FPN_BADGE_CIRCLE = "rxw-fpn-aircraft-halo";
export const RXW_FPN_BADGE_LABEL = "rxw-fpn-aircraft-label";
export const RXW_FPN_ROUTE_SOURCE = "rxw-fpn-selected-route";
export const RXW_FPN_ROUTE_LINE = "rxw-fpn-selected-line";
export const RXW_FPN_ROUTE_POINTS = "rxw-fpn-selected-waypoints";
export const RXW_FPN_ROUTE_LABEL = "rxw-fpn-selected-waypoint-label";

type LivePosition = { icaoHex: string; callsign: string | null; lat: number | null; lon: number | null; seenPosSeconds: number | null };

/** A badge is bound to BOTH the aircraft ICAO24 and live callsign. */
export function createRxwFpnBadges(
  aircraft: ReadonlyMap<string, LivePosition>,
  available: readonly RxwWaypointAvailability[],
): FeatureCollection<Point> {
  const features: Array<Feature<Point>> = [];
  for (const entry of available.slice(0, 256)) {
    const live = aircraft.get(entry.icaoHex);
    if (!live || live.callsign?.trim().toUpperCase() !== entry.flight) continue;
    const { lat, lon } = live;
    if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    if (live.seenPosSeconds === null || live.seenPosSeconds > 60) continue;
    features.push({
      type: "Feature",
      properties: { icaoHex: entry.icaoHex, flight: entry.flight, waypointCount: entry.waypointCount },
      geometry: { type: "Point", coordinates: [lon, lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Draw ONLY adjacent georeferenced fixes. Missing positions never create inferred lines. */
export function createRxwFpnRoute(plan: RxwWaypointPlan | null): FeatureCollection<LineString | Point> {
  if (!plan || plan.status !== "planned") return { type: "FeatureCollection", features: [] };
  const features: Array<Feature<LineString | Point>> = [];
  let previous: RxwWaypointPlan["waypoints"][number] | null = null;
  for (const [index, point] of plan.waypoints.entries()) {
    const positioned = point.lat !== null && point.lon !== null
      && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
    if (positioned) {
      const coordinates: [number, number] = [point.lon!, point.lat!];
      features.push({
        type: "Feature",
        properties: { name: point.name, index, labelVisible: index % 3 === 0 || index === plan.waypoints.length - 1 },
        geometry: { type: "Point", coordinates },
      });
      if (!point.breakBefore && previous && previous.lat !== null && previous.lon !== null
        && Math.abs(previous.lon - point.lon!) <= 180) {
        features.push({
          type: "Feature",
          properties: { from: previous!.name, to: point.name, reported: true },
          geometry: { type: "LineString", coordinates: [[previous!.lon!, previous!.lat!], coordinates] },
        });
      }
    }
    previous = positioned ? point : null;
  }
  return { type: "FeatureCollection", features };
}
