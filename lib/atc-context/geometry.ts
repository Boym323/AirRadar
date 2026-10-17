import { distanceToGreatCircleSegmentKm, haversineDistanceKm, initialBearing } from "@/lib/geo";

export type LonLat = [number, number];
export type PolygonRings = LonLat[][];
const NM_PER_KM = 1 / 1.852;

export function bbox(rings: PolygonRings): [number, number, number, number] {
  // Keep this allocation-free. ATC imports contain a few large rings and the
  // old flat/map/spread pipeline briefly materialised several copies of every
  // vertex during dataset preparation.
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (const point of ring) {
      minLon = Math.min(minLon, point[0]);
      minLat = Math.min(minLat, point[1]);
      maxLon = Math.max(maxLon, point[0]);
      maxLat = Math.max(maxLat, point[1]);
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}
export function bboxContains(box: [number, number, number, number], point: LonLat): boolean {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];
}
export async function bboxAsync(rings: PolygonRings): Promise<[number, number, number, number]> {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let processed = 0;
  let sliceStarted = performance.now();
  for (const ring of rings) {
    for (const point of ring) {
      minLon = Math.min(minLon, point[0]);
      minLat = Math.min(minLat, point[1]);
      maxLon = Math.max(maxLon, point[0]);
      maxLat = Math.max(maxLat, point[1]);
      processed += 1;
      if ((processed & 255) === 0 && performance.now() - sliceStarted >= 6) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        sliceStarted = performance.now();
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}
function ringContains(point: LonLat, ring: LonLat[]): "inside" | "boundary" | null {
  let inside = false;
  const x = point[0];
  const y = point[1];
  const epsilon = 1e-9;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const ay = a[1];
    const by = b[1];
    const minY = ay < by ? ay : by;
    const maxY = ay > by ? ay : by;
    if (y >= minY - epsilon && y <= maxY + epsilon) {
      const cross = (y - ay) * (b[0] - a[0]) - (x - a[0]) * (by - ay);
      if (Math.abs(cross) < epsilon) {
        const minX = a[0] < b[0] ? a[0] : b[0];
        const maxX = a[0] > b[0] ? a[0] : b[0];
        if (x >= minX - epsilon && x <= maxX + epsilon) return "boundary";
      }
    }
    if ((by > y) !== (ay > y) && x < ((a[0] - b[0]) * (y - by)) / (ay - by) + b[0]) {
      inside = !inside;
    }
  }
  return inside ? "inside" : null;
}
/** GeoJSON polygon semantics: first ring is exterior, subsequent rings are holes. Boundary is inside for UI. */
export function pointInPolygon(point: LonLat, rings: PolygonRings): "inside" | "boundary" | null {
  if (!rings[0]) return null;
  const exterior = ringContains(point, rings[0]);
  if (exterior === null) return null;
  let boundary = exterior === "boundary";
  for (let i = 1; i < rings.length; i++) {
    const hole = ringContains(point, rings[i]);
    if (hole === "inside") return null;
    if (hole === "boundary") boundary = true;
  }
  return boundary ? "boundary" : "inside";
}
export function distanceToSegmentNm(point: LonLat, from: LonLat, to: LonLat): number { return distanceToGreatCircleSegmentKm(from[1], from[0], to[1], to[0], point[1], point[0]) * NM_PER_KM; }
export function bearing(from: LonLat, to: LonLat): number { return initialBearing(from[1], from[0], to[1], to[0]); }
export function distanceNm(a: LonLat, b: LonLat): number { return haversineDistanceKm(a[1], a[0], b[1], b[0]) * NM_PER_KM; }
export function destination(point: LonLat, distanceNmValue: number, track: number): LonLat { const km = distanceNmValue * 1.852; const [lon, lat] = (awaitlessDestination(point[1], point[0], km, track)); return [lon, lat]; }
function awaitlessDestination(lat: number, lon: number, km: number, track: number): LonLat { const r = 6371; const d = km / r; const b = track * Math.PI / 180; const p = lat * Math.PI / 180; const l = lon * Math.PI / 180; const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b)); const l2 = l + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2)); return [((l2 * 180 / Math.PI + 540) % 360) - 180, p2 * 180 / Math.PI]; }
export function angleDifference(a: number, b: number): number { const d = Math.abs(((a - b + 540) % 360) - 180); return d; }
