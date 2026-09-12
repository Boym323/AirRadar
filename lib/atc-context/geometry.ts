import { distanceToGreatCircleSegmentKm, haversineDistanceKm, initialBearing } from "@/lib/geo";

export type LonLat = [number, number];
export type PolygonRings = LonLat[][];
const NM_PER_KM = 1 / 1.852;

export function bbox(rings: PolygonRings): [number, number, number, number] {
  const points = rings.flat();
  return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
}
export function bboxContains(box: [number, number, number, number], point: LonLat): boolean {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];
}
function onSegment(p: LonLat, a: LonLat, b: LonLat): boolean {
  const cross = (p[1] - a[1]) * (b[0] - a[0]) - (p[0] - a[0]) * (b[1] - a[1]);
  return Math.abs(cross) < 1e-9 && p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 && p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;
}
function ringContains(point: LonLat, ring: LonLat[]): "inside" | "boundary" | null {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (onSegment(point, ring[j], ring[i])) return "boundary";
    if ((ring[i][1] > point[1]) !== (ring[j][1] > point[1]) && point[0] < ((ring[j][0] - ring[i][0]) * (point[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
  }
  return inside ? "inside" : null;
}
/** GeoJSON polygon semantics: first ring is exterior, subsequent rings are holes. Boundary is inside for UI. */
export function pointInPolygon(point: LonLat, rings: PolygonRings): "inside" | "boundary" | null {
  if (!rings[0] || ringContains(point, rings[0]) === null) return null;
  if (rings.slice(1).some((hole) => ringContains(point, hole) === "inside")) return null;
  return rings.some((ring) => ringContains(point, ring) === "boundary") ? "boundary" : "inside";
}
export function distanceToSegmentNm(point: LonLat, from: LonLat, to: LonLat): number { return distanceToGreatCircleSegmentKm(from[1], from[0], to[1], to[0], point[1], point[0]) * NM_PER_KM; }
export function bearing(from: LonLat, to: LonLat): number { return initialBearing(from[1], from[0], to[1], to[0]); }
export function distanceNm(a: LonLat, b: LonLat): number { return haversineDistanceKm(a[1], a[0], b[1], b[0]) * NM_PER_KM; }
export function destination(point: LonLat, distanceNmValue: number, track: number): LonLat { const km = distanceNmValue * 1.852; const [lon, lat] = (awaitlessDestination(point[1], point[0], km, track)); return [lon, lat]; }
function awaitlessDestination(lat: number, lon: number, km: number, track: number): LonLat { const r = 6371; const d = km / r; const b = track * Math.PI / 180; const p = lat * Math.PI / 180; const l = lon * Math.PI / 180; const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b)); const l2 = l + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2)); return [((l2 * 180 / Math.PI + 540) % 360) - 180, p2 * 180 / Math.PI]; }
export function angleDifference(a: number, b: number): number { const d = Math.abs(((a - b + 540) % 360) - 180); return d; }
