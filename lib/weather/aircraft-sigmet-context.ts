import type { AircraftView } from "@/lib/aircraft/types";
import type { SigmetGeometry, SigmetSnapshot } from "@/lib/weather/types";

export type AircraftSigmetVerticalMatch = "matched" | "unknown";

export interface AircraftSigmetContext {
  id: string;
  hazard: string | null;
  phenomenon: string | null;
  qualifier: string | null;
  firName: string | null;
  validTo: string | null;
  lowerFt: number | null;
  upperFt: number | null;
  verticalMatch: AircraftSigmetVerticalMatch;
  source: "isigmet" | "airsigmet";
}

function unwrapLongitude(value: number, reference: number): number {
  let result = value;
  while (result - reference > 180) result -= 360;
  while (result - reference < -180) result += 360;
  return result;
}

function pointOnSegment(lon: number, lat: number, ax: number, ay: number, bx: number, by: number): boolean {
  const cross = (lon - ax) * (by - ay) - (lat - ay) * (bx - ax);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (lon - ax) * (lon - bx) + (lat - ay) * (lat - by);
  return dot <= 1e-9;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const currentLon = unwrapLongitude(currentPoint[0], lon);
    const previousLon = unwrapLongitude(previousPoint[0], lon);
    const currentLat = currentPoint[1];
    const previousLat = previousPoint[1];
    if (pointOnSegment(lon, lat, currentLon, currentLat, previousLon, previousLat)) return true;
    const intersects = ((currentLat > lat) !== (previousLat > lat))
      && lon < ((previousLon - currentLon) * (lat - currentLat)) / ((previousLat - currentLat) || Number.EPSILON) + currentLon;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, rings: number[][][]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !pointInRing(lon, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lon, lat, hole));
}

export function pointInSigmetGeometry(lon: number, lat: number, geometry: SigmetGeometry): boolean {
  if (geometry.type === "Polygon") return pointInPolygon(lon, lat, geometry.coordinates);
  return geometry.coordinates.some((polygon) => pointInPolygon(lon, lat, polygon));
}

function verticalMatch(altitudeFt: number | null, lowerFt: number | null, upperFt: number | null): AircraftSigmetVerticalMatch | "outside" {
  if (altitudeFt === null || (lowerFt === null && upperFt === null)) return "unknown";
  if (lowerFt !== null && altitudeFt < lowerFt) return "outside";
  if (upperFt !== null && altitudeFt > upperFt) return "outside";
  return "matched";
}

export function aircraftSigmetContext(aircraft: AircraftView | null, snapshot: SigmetSnapshot): AircraftSigmetContext[] {
  if (!aircraft || aircraft.lat === null || aircraft.lon === null) return [];

  const altitudeFt = aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude ?? null;
  const matches: AircraftSigmetContext[] = [];

  for (const feature of snapshot.features) {
    if (!pointInSigmetGeometry(aircraft.lon, aircraft.lat, feature.geometry)) continue;
    const match = verticalMatch(altitudeFt, feature.properties.lowerFt, feature.properties.upperFt);
    if (match === "outside") continue;
    matches.push({
      id: feature.id,
      hazard: feature.properties.hazard,
      phenomenon: feature.properties.phenomenon,
      qualifier: feature.properties.qualifier,
      firName: feature.properties.firName,
      validTo: feature.properties.validTo,
      lowerFt: feature.properties.lowerFt,
      upperFt: feature.properties.upperFt,
      verticalMatch: match,
      source: feature.properties.source,
    });
  }

  return matches.sort((left, right) => {
    if (left.verticalMatch !== right.verticalMatch) return left.verticalMatch === "matched" ? -1 : 1;
    return (left.validTo ?? "").localeCompare(right.validTo ?? "");
  });
}
