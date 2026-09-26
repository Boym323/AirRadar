import type { Aircraft } from "@/lib/aircraft/types";
import type { RouteIntelligenceResult } from "@/lib/route-intelligence";
import { pointInSigmetGeometry } from "@/lib/weather/aircraft-sigmet-context";
import type { SigmetSnapshot } from "@/lib/weather/types";

const EARTH_RADIUS_NM = 3440.065;

export interface RouteWeatherSigmetMatch {
  sigmetId: string;
  hazard: string | null;
  firName: string | null;
  validTo: string | null;
  routeDesignator: string;
  fromName: string;
  toName: string;
  segmentId: string;
  segmentConfidence: "HIGH" | "MEDIUM";
  verticalMatch: "matched" | "unknown";
  distanceAlongRouteNm: number;
}

export interface RouteWeatherContext {
  status: "available" | "no_route" | "unavailable";
  routeStatus: RouteIntelligenceResult["status"];
  routeCoveragePercent: number | null;
  routeSource: string | null;
  unresolvedRouteTokens: string[];
  matches: RouteWeatherSigmetMatch[];
  stale: boolean;
}

function toRad(value: number): number { return value * Math.PI / 180; }
function distanceNm(a: [number, number], b: [number, number]): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function unwrapLongitude(value: number, reference: number): number {
  let result = value;
  while (result - reference > 180) result -= 360;
  while (result - reference < -180) result += 360;
  return result;
}

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pointAtFraction(from: [number, number], to: [number, number], fraction: number): [number, number] {
  const value = clampFraction(fraction);
  const unwrappedToLon = unwrapLongitude(to[0], from[0]);
  const lon = from[0] + (unwrappedToLon - from[0]) * value;
  const normalizedLon = ((lon + 540) % 360) - 180;
  return [normalizedLon, from[1] + (to[1] - from[1]) * value];
}

function segmentIntersectionFraction(
  from: [number, number],
  to: [number, number],
  left: [number, number],
  right: [number, number],
): number | null {
  const epsilon = 1e-10;
  const ax = from[0];
  const ay = from[1];
  const bx = unwrapLongitude(to[0], ax);
  const by = to[1];
  const cx = unwrapLongitude(left[0], ax);
  const cy = left[1];
  const dx = unwrapLongitude(right[0], ax);
  const dy = right[1];

  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denominator = rx * sy - ry * sx;
  const qpx = cx - ax;
  const qpy = cy - ay;

  if (Math.abs(denominator) < epsilon) {
    const collinear = Math.abs(qpx * ry - qpy * rx) < epsilon;
    const lengthSquared = rx * rx + ry * ry;
    if (!collinear || lengthSquared < epsilon) return null;
    const t0 = (qpx * rx + qpy * ry) / lengthSquared;
    const t1 = ((dx - ax) * rx + (dy - ay) * ry) / lengthSquared;
    const overlapStart = Math.max(0, Math.min(t0, t1));
    const overlapEnd = Math.min(1, Math.max(t0, t1));
    return overlapStart <= overlapEnd + epsilon ? clampFraction(overlapStart) : null;
  }

  const t = (qpx * sy - qpy * sx) / denominator;
  const u = (qpx * ry - qpy * rx) / denominator;
  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return null;
  return clampFraction(t);
}

function routeSegmentSigmetEntryFraction(
  from: [number, number],
  to: [number, number],
  geometry: SigmetSnapshot["features"][number]["geometry"],
  startFraction = 0,
): number | null {
  const start = clampFraction(startFraction);
  const startPoint = pointAtFraction(from, to, start);
  if (pointInSigmetGeometry(startPoint[0], startPoint[1], geometry)) return start;

  let firstIntersection: number | null = null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        const left = ring[index - 1];
        const right = ring[index];
        if (!left || !right) continue;
        const fraction = segmentIntersectionFraction(from, to, [left[0], left[1]], [right[0], right[1]]);
        if (fraction === null || fraction + 1e-10 < start) continue;
        if (firstIntersection === null || fraction < firstIntersection) firstIntersection = fraction;
      }
    }
  }
  if (firstIntersection !== null) return firstIntersection;

  const endPoint = pointAtFraction(from, to, 1);
  return pointInSigmetGeometry(endPoint[0], endPoint[1], geometry) ? 1 : null;
}

function verticalMatch(aircraft: Aircraft, lowerFt: number | null, upperFt: number | null): "matched" | "unknown" | "outside" {
  const altitude = aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude;
  if (altitude === null || (lowerFt === null && upperFt === null)) return "unknown";
  if (lowerFt !== null && altitude < lowerFt) return "outside";
  if (upperFt !== null && altitude > upperFt) return "outside";
  return "matched";
}

export function buildRouteWeatherContext(
  aircraft: Aircraft,
  route: RouteIntelligenceResult,
  sigmets: SigmetSnapshot,
): RouteWeatherContext {
  if (route.status === "NO_ROUTE" || route.status === "NO_ATS_DATA") {
    return {
      status: "no_route",
      routeStatus: route.status,
      routeCoveragePercent: route.routeCoveragePercent,
      routeSource: route.source.aircraftRouteSource,
      unresolvedRouteTokens: route.unresolvedRouteTokens,
      matches: [],
      stale: sigmets.stale,
    };
  }

  const remaining = new Set(route.progress.remainingSegmentIds);
  if (route.progress.currentSegmentId) remaining.add(route.progress.currentSegmentId);
  const segments = route.matchedSegments.filter((segment) => remaining.has(segment.segmentId));
  if (!segments.length) {
    return {
      status: "unavailable",
      routeStatus: route.status,
      routeCoveragePercent: route.routeCoveragePercent,
      routeSource: route.source.aircraftRouteSource,
      unresolvedRouteTokens: route.unresolvedRouteTokens,
      matches: [],
      stale: sigmets.stale,
    };
  }

  let cumulativeNm = 0;
  const matches: RouteWeatherSigmetMatch[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const from: [number, number] = segment.from;
    const to: [number, number] = segment.to;
    const segmentLengthNm = distanceNm(from, to);
    const startFraction = segment.segmentId === route.progress.currentSegmentId && typeof segment.alongTrackProgress === "number"
      ? clampFraction(segment.alongTrackProgress)
      : 0;
    for (const feature of sigmets.features) {
      const vertical = verticalMatch(aircraft, feature.properties.lowerFt, feature.properties.upperFt);
      if (vertical === "outside") continue;
      const entryFraction = routeSegmentSigmetEntryFraction(from, to, feature.geometry, startFraction);
      if (entryFraction === null) continue;
      const key = `${feature.id}:${segment.segmentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        sigmetId: feature.id,
        hazard: feature.properties.hazard ?? feature.properties.phenomenon,
        firName: feature.properties.firName,
        validTo: feature.properties.validTo,
        routeDesignator: segment.routeDesignator,
        fromName: segment.fromName,
        toName: segment.toName,
        segmentId: segment.segmentId,
        segmentConfidence: segment.confidence,
        verticalMatch: vertical,
        distanceAlongRouteNm: Number((cumulativeNm + segmentLengthNm * Math.max(0, entryFraction - startFraction)).toFixed(1)),
      });
    }
    cumulativeNm += segmentLengthNm * (1 - startFraction);
  }

  matches.sort((a, b) => a.distanceAlongRouteNm - b.distanceAlongRouteNm || a.sigmetId.localeCompare(b.sigmetId));
  return {
    status: "available",
    routeStatus: route.status,
    routeCoveragePercent: route.routeCoveragePercent,
    routeSource: route.source.aircraftRouteSource,
    unresolvedRouteTokens: route.unresolvedRouteTokens,
    matches,
    stale: sigmets.stale,
  };
}
