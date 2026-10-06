import { haversineDistanceKm, initialBearing } from "@/lib/geo";
import { destination } from "@/lib/atc-context/geometry";
import type { RouteCoordinate, RouteIntelligenceV2Snapshot } from "@/lib/route-intelligence";
import {
  OPERATIONAL_TWIN_HORIZON_MINUTES,
  OPERATIONAL_TWIN_STEP_MINUTES,
  type OperationalTwinCorridor,
  type OperationalTwinCorridorMode,
  type OperationalTwinTrajectoryPoint,
  type OperationalTwinWaypointEstimate,
} from "./types";

const KM_PER_NM = 1.852;
const MAX_ALTITUDE_FT = 60_000;
const VERTICAL_RATE_HOLD_MINUTES = 10;

export interface OperationalTwinAircraftState {
  icaoHex: string;
  callsign: string | null;
  registration: string | null;
  observedAt: string;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  groundSpeedKt: number | null;
  trackDeg: number | null;
  verticalRateFpm: number | null;
  onGround: boolean;
  /** Optional aircraft metadata and ADS-B target-state inputs used only by additive shadow models. */
  aircraftType?: string | null;
  aircraftDescription?: string | null;
  category?: string | null;
  selectedAltitudeFt?: number | null;
  selectedAltitudeSource?: "MCP/FCU" | "FMS" | "N/A" | null;
  stateSource?: "CANONICAL" | "TRACK_FUSION";
  trackFusionReadiness?: "PASS" | "WAIT" | "FAIL" | null;
}

interface RoutePath {
  coordinates: RouteCoordinate[];
  waypoints: Array<{
    id: string;
    name: string;
    coordinate: RouteCoordinate;
    sourceKind: string;
  }>;
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function validCoordinate(value: RouteCoordinate | null | undefined): value is RouteCoordinate {
  return Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lon)
    && value.lat >= -90 && value.lat <= 90 && value.lon >= -180 && value.lon <= 180);
}

function sameCoordinate(left: RouteCoordinate, right: RouteCoordinate): boolean {
  return Math.abs(left.lat - right.lat) < 1e-7 && Math.abs(left.lon - right.lon) < 1e-7;
}

function pushCoordinate(target: RouteCoordinate[], value: RouteCoordinate | null | undefined): void {
  if (!validCoordinate(value)) return;
  const previous = target.at(-1);
  if (!previous || !sameCoordinate(previous, value)) target.push({ lat: value.lat, lon: value.lon });
}

function routePath(route: RouteIntelligenceV2Snapshot | null): RoutePath | null {
  if (!route || route.dynamic.routeAdherence === "OFF_ROUTE") return null;
  const ordered = [...route.route.elements].sort((a, b) => a.sequence - b.sequence);
  if (!ordered.length) return null;
  const currentId = route.dynamic.currentElement?.id ?? null;
  const currentIndex = currentId ? ordered.findIndex((element) => element.id === currentId) : 0;
  const startIndex = currentIndex >= 0 ? currentIndex : 0;
  const coordinates: RouteCoordinate[] = [];
  const waypoints: RoutePath["waypoints"] = [];

  for (let index = startIndex; index < ordered.length; index += 1) {
    const element = ordered[index]!;
    if (element.status !== "RESOLVED") continue;

    if (index === startIndex) {
      // Avoid backtracking to the beginning of the current leg. Start with its
      // remaining endpoint; subsequent elements can contribute full geometry.
      pushCoordinate(coordinates, element.to?.coordinates ?? null);
    } else if (element.geometry?.coordinates.length) {
      for (const coordinate of element.geometry.coordinates) pushCoordinate(coordinates, coordinate);
    } else {
      pushCoordinate(coordinates, element.from?.coordinates ?? null);
      pushCoordinate(coordinates, element.to?.coordinates ?? null);
    }

    if (validCoordinate(element.to?.coordinates ?? null) && element.to) {
      const exists = waypoints.some((candidate) => candidate.id === element.to!.id);
      if (!exists) {
        waypoints.push({
          id: element.to.id,
          name: element.to.name,
          coordinate: { ...element.to.coordinates! },
          sourceKind: element.source.kind,
        });
      }
    }
  }

  return coordinates.length ? { coordinates, waypoints } : null;
}

function distanceNm(from: RouteCoordinate, to: RouteCoordinate): number {
  return haversineDistanceKm(from.lat, from.lon, to.lat, to.lon) / KM_PER_NM;
}

function interpolate(from: RouteCoordinate, to: RouteCoordinate, distanceFromStartNm: number): RouteCoordinate {
  const segmentNm = distanceNm(from, to);
  if (segmentNm <= 0 || distanceFromStartNm <= 0) return { ...from };
  if (distanceFromStartNm >= segmentNm) return { ...to };
  const bearing = initialBearing(from.lat, from.lon, to.lat, to.lon);
  const [lon, lat] = destination([from.lon, from.lat], distanceFromStartNm, bearing);
  return { lat, lon };
}

function routePosition(
  start: RouteCoordinate,
  path: RouteCoordinate[],
  distanceFromStartNm: number,
): { coordinate: RouteCoordinate; trackDeg: number | null } {
  let remaining = Math.max(0, distanceFromStartNm);
  let from = start;

  for (const to of path) {
    const segmentNm = distanceNm(from, to);
    if (segmentNm <= 0) {
      from = to;
      continue;
    }
    if (remaining <= segmentNm) {
      return {
        coordinate: interpolate(from, to, remaining),
        trackDeg: initialBearing(from.lat, from.lon, to.lat, to.lon),
      };
    }
    remaining -= segmentNm;
    from = to;
  }

  return { coordinate: { ...from }, trackDeg: null };
}

function kinematicPosition(
  start: RouteCoordinate,
  trackDeg: number | null,
  distanceFromStartNm: number,
): RouteCoordinate {
  if (!finite(trackDeg) || distanceFromStartNm <= 0) return { ...start };
  const [lon, lat] = destination([start.lon, start.lat], distanceFromStartNm, trackDeg);
  return { lat, lon };
}

function projectedAltitude(base: number | null, verticalRateFpm: number | null, offsetMinutes: number): number | null {
  if (!finite(base)) return null;
  const rate = finite(verticalRateFpm) ? verticalRateFpm : 0;
  const activeMinutes = Math.min(offsetMinutes, VERTICAL_RATE_HOLD_MINUTES);
  return Math.max(0, Math.min(MAX_ALTITUDE_FT, Math.round(base + rate * activeMinutes)));
}

function uncertaintyNm(mode: OperationalTwinCorridorMode, offsetMinutes: number, precision: string | null): number {
  const base = mode === "ROUTE_AWARE" ? 0.8 + 0.18 * offsetMinutes : 1.5 + 0.45 * offsetMinutes;
  const multiplier = precision === "PRECISE" ? 1 : precision === "ESTIMATED" || precision === "PARTIAL" ? 1.35 : 1.6;
  return Number((base * multiplier).toFixed(2));
}

function waypointEstimates(
  aircraft: OperationalTwinAircraftState,
  path: RoutePath | null,
  speedKt: number,
  generatedAtMs: number,
): OperationalTwinWaypointEstimate[] {
  if (!path || speedKt < 30) return [];
  const result: OperationalTwinWaypointEstimate[] = [];
  let from = { lat: aircraft.lat, lon: aircraft.lon };
  let cumulative = 0;

  for (const waypoint of path.waypoints) {
    cumulative += distanceNm(from, waypoint.coordinate);
    from = waypoint.coordinate;
    const offsetMinutes = cumulative / speedKt * 60;
    if (offsetMinutes < 0 || offsetMinutes > OPERATIONAL_TWIN_HORIZON_MINUTES) continue;
    result.push({
      id: waypoint.id,
      name: waypoint.name,
      lat: waypoint.coordinate.lat,
      lon: waypoint.coordinate.lon,
      offsetMinutes: Number(offsetMinutes.toFixed(1)),
      at: new Date(generatedAtMs + offsetMinutes * 60_000).toISOString(),
      distanceNm: Number(cumulative.toFixed(1)),
      sourceKind: waypoint.sourceKind,
    });
  }
  return result;
}

export function buildOperationalTwinCorridor(
  aircraft: OperationalTwinAircraftState,
  route: RouteIntelligenceV2Snapshot | null,
  generatedAt: Date,
): OperationalTwinCorridor | null {
  if (aircraft.onGround || !Number.isFinite(aircraft.lat) || !Number.isFinite(aircraft.lon)) return null;
  const speedKt = finite(aircraft.groundSpeedKt) && aircraft.groundSpeedKt >= 30 ? aircraft.groundSpeedKt : null;
  if (speedKt === null) return null;

  const start = { lat: aircraft.lat, lon: aircraft.lon };
  const path = routePath(route);
  const mode: OperationalTwinCorridorMode = path ? "ROUTE_AWARE" : "KINEMATIC";
  const precision = route?.dynamic.precision ?? null;
  const points: OperationalTwinTrajectoryPoint[] = [];

  for (let offsetMinutes = 0; offsetMinutes <= OPERATIONAL_TWIN_HORIZON_MINUTES; offsetMinutes += OPERATIONAL_TWIN_STEP_MINUTES) {
    const distanceFromStartNm = speedKt * offsetMinutes / 60;
    const routeProjection = mode === "ROUTE_AWARE"
      ? routePosition(start, path!.coordinates, distanceFromStartNm)
      : null;
    const coordinate = routeProjection?.coordinate
      ?? kinematicPosition(start, aircraft.trackDeg, distanceFromStartNm);
    const trackDeg = routeProjection?.trackDeg ?? aircraft.trackDeg;
    points.push({
      offsetMinutes,
      at: new Date(generatedAt.getTime() + offsetMinutes * 60_000).toISOString(),
      lat: coordinate.lat,
      lon: coordinate.lon,
      altitudeFt: projectedAltitude(aircraft.altitudeFt, aircraft.verticalRateFpm, offsetMinutes),
      trackDeg: finite(trackDeg) ? trackDeg : null,
      uncertaintyNm: uncertaintyNm(mode, offsetMinutes, precision),
      mode,
    });
  }

  return {
    horizonMinutes: OPERATIONAL_TWIN_HORIZON_MINUTES,
    stepMinutes: OPERATIONAL_TWIN_STEP_MINUTES,
    mode,
    routeAdherence: route?.dynamic.routeAdherence ?? null,
    routePrecision: precision,
    maxUncertaintyNm: points.at(-1)?.uncertaintyNm ?? 0,
    points,
    waypoints: waypointEstimates(aircraft, path, speedKt, generatedAt.getTime()),
  };
}
