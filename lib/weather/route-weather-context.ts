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

function orientation(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: [number, number], b: [number, number], c: [number, number]): boolean {
  return Math.abs(orientation(a, b, c)) < 1e-10
    && c[0] >= Math.min(a[0], b[0]) - 1e-10 && c[0] <= Math.max(a[0], b[0]) + 1e-10
    && c[1] >= Math.min(a[1], b[1]) - 1e-10 && c[1] <= Math.max(a[1], b[1]) + 1e-10;
}

function segmentsIntersect(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  return (Math.abs(o1) < 1e-10 && onSegment(a, b, c))
    || (Math.abs(o2) < 1e-10 && onSegment(a, b, d))
    || (Math.abs(o3) < 1e-10 && onSegment(c, d, a))
    || (Math.abs(o4) < 1e-10 && onSegment(c, d, b));
}

function routeSegmentIntersectsSigmet(
  from: [number, number],
  to: [number, number],
  geometry: SigmetSnapshot["features"][number]["geometry"],
): boolean {
  if (pointInSigmetGeometry(from[0], from[1], geometry) || pointInSigmetGeometry(to[0], to[1], geometry)) return true;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i += 1) {
        const left = ring[i - 1];
        const right = ring[i];
        if (!left || !right) continue;
        if (segmentsIntersect(from, to, [left[0], left[1]], [right[0], right[1]])) return true;
      }
    }
  }
  return false;
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
    for (const feature of sigmets.features) {
      const vertical = verticalMatch(aircraft, feature.properties.lowerFt, feature.properties.upperFt);
      if (vertical === "outside" || !routeSegmentIntersectsSigmet(from, to, feature.geometry)) continue;
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
        distanceAlongRouteNm: Number(cumulativeNm.toFixed(1)),
      });
    }
    cumulativeNm += segmentLengthNm;
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
