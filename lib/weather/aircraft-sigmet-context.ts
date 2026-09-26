import type { AircraftView } from "@/lib/aircraft/types";
import type { SigmetGeometry, SigmetSnapshot } from "@/lib/weather/types";

export type AircraftSigmetVerticalMatch = "matched" | "unknown";

export interface AircraftSigmetContext {
  id: string;
  relation: "current" | "projected";
  estimatedMinutes: number | null;
  distanceNm: number | null;
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

export function projectPosition(lat: number, lon: number, trackDeg: number, distanceNm: number): { lat: number; lon: number } {
  const angularDistance = distanceNm / 3440.065;
  const bearing = trackDeg * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  const projectedLon = ((lon2 * 180 / Math.PI + 540) % 360) - 180;
  return { lat: lat2 * 180 / Math.PI, lon: projectedLon };
}

export function aircraftSigmetContext(aircraft: AircraftView | null, snapshot: SigmetSnapshot): AircraftSigmetContext[] {
  if (!aircraft || aircraft.lat === null || aircraft.lon === null) return [];

  const altitudeFt = aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude ?? null;
  const verticalRateFpm = aircraft.verticalRate ?? aircraft.baroRate ?? aircraft.geomRate ?? null;
  const matches: AircraftSigmetContext[] = [];
  const currentIds = new Set<string>();

  for (const feature of snapshot.features) {
    if (!pointInSigmetGeometry(aircraft.lon, aircraft.lat, feature.geometry)) continue;
    const match = verticalMatch(altitudeFt, feature.properties.lowerFt, feature.properties.upperFt);
    if (match === "outside") continue;
    currentIds.add(feature.id);
    matches.push({
      id: feature.id,
      relation: "current",
      estimatedMinutes: 0,
      distanceNm: 0,
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

  const speedKt = aircraft.groundSpeed;
  const trackDeg = aircraft.track;
  if (!aircraft.onGround && speedKt !== null && speedKt >= 30 && trackDeg !== null) {
    for (const feature of snapshot.features) {
      if (currentIds.has(feature.id)) continue;
      for (let minute = 1; minute <= 15; minute += 1) {
        const distanceNm = speedKt * minute / 60;
        const projected = projectPosition(aircraft.lat, aircraft.lon, trackDeg, distanceNm);
        if (!pointInSigmetGeometry(projected.lon, projected.lat, feature.geometry)) continue;
        const projectedAltitude = altitudeFt === null
          ? null
          : altitudeFt + (verticalRateFpm ?? 0) * minute;
        const match = verticalMatch(projectedAltitude, feature.properties.lowerFt, feature.properties.upperFt);
        if (match === "outside") continue;
        matches.push({
          id: feature.id,
          relation: "projected",
          estimatedMinutes: minute,
          distanceNm,
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
        break;
      }
    }
  }

  return matches.sort((left, right) => {
    if (left.relation !== right.relation) return left.relation === "current" ? -1 : 1;
    if ((left.estimatedMinutes ?? 0) !== (right.estimatedMinutes ?? 0)) return (left.estimatedMinutes ?? 0) - (right.estimatedMinutes ?? 0);
    if (left.verticalMatch !== right.verticalMatch) return left.verticalMatch === "matched" ? -1 : 1;
    return (left.validTo ?? "").localeCompare(right.validTo ?? "");
  });
}
