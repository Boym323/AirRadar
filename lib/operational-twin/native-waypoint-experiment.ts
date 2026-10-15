import { haversineDistanceKm } from "@/lib/geo";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

/** Experimental read-only batched waypoint predicate. No event-outcome state changes. */
export function waypointWindowMatches(
  points: Float64Array,
  lat: number,
  lon: number,
  native = false,
): Uint8Array {
  if (points.length % 2 !== 0) throw new RangeError("Expected interleaved latitude/longitude pairs");
  if (points.length > 2_000_000) throw new RangeError("Waypoint batch too large");
  if (native) {
    const addon = getNativeBeastEngine();
    if (addon) return addon.batchWaypointMatches(points, lat, lon);
  }
  const matches = new Uint8Array(points.length / 2);
  for (let i = 0; i < matches.length; i += 1) {
    const offset = i * 2;
    matches[i] = Number(haversineDistanceKm(points[offset]!, points[offset + 1]!, lat, lon) / 1.852 <= 3);
  }
  return matches;
}
