import type { AircraftView, TrailPoint } from "@/lib/aircraft/types";
import { haversineDistanceKm } from "@/lib/geo";
import { positionObservedAt } from "@/lib/aircraft/source-merge";

export type TrailPosition = Pick<TrailPoint, "lat" | "lon" | "recordedAt"> & Partial<Pick<TrailPoint, "altitude" | "groundSpeed" | "track">>;

function recordedAtMs(point: TrailPosition): number {
  return Date.parse(point.recordedAt);
}

function trailPointKey(point: TrailPosition): string {
  return `${point.recordedAt}|${point.lat}|${point.lon}`;
}

// A persisted position can be several polling intervals old, so this is
// deliberately above normal airliner groundspeed.  The former 1.5 km/s
// ceiling (5,400 km/h) still admitted receiver glitches and produced long
// cross-map segments in the selected trail.
const MAX_TRAIL_SPEED_KM_PER_SECOND = 0.45;

function isPlausibleTransition(previous: TrailPosition, next: TrailPosition): boolean {
  const previousAt = recordedAtMs(previous);
  const nextAt = recordedAtMs(next);
  const elapsedSeconds = (nextAt - previousAt) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return false;
  return haversineDistanceKm(previous.lat, previous.lon, next.lat, next.lon) / elapsedSeconds <= MAX_TRAIL_SPEED_KM_PER_SECOND;
}

/**
 * Returns a chronological, duplicate-free trail. Invalid timestamps and
 * physically impossible transitions are ignored so a malformed or previously
 * persisted provider/history point cannot draw a false line across the map.
 * The trail is retained for as long as its aircraft remains present in the
 * live state.
 */
export function boundTrailPoints(points: readonly TrailPosition[], now = Date.now()): TrailPoint[] {
  void now;
  const valid = points
    .map((point, index) => ({ point, index, timestamp: recordedAtMs(point) }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
  const unique = new Map<string, TrailPoint>();

  for (const item of valid) {
    unique.set(trailPointKey(item.point), {
      lat: item.point.lat,
      lon: item.point.lon,
      recordedAt: item.point.recordedAt,
      altitude: item.point.altitude ?? null,
      groundSpeed: item.point.groundSpeed ?? null,
      track: item.point.track ?? null,
    });
  }

  const deduplicated: TrailPoint[] = [];
  for (const point of unique.values()) {
    const previous = deduplicated.at(-1);
    if (previous && Math.abs(previous.lat - point.lat) <= 0.00001 && Math.abs(previous.lon - point.lon) <= 0.00001) {
      deduplicated[deduplicated.length - 1] = point;
    } else {
      deduplicated.push(point);
    }
  }

  // appendTrailPoint() already protects the live tail, but history loaded from
  // PostgreSQL can contain samples written before that guard existed (or from a
  // transient bad provider/source switch). The selected trail is rendered as a
  // single LineString, so even one impossible persisted point would otherwise
  // create the long orange cross-map segments seen on the radar.
  const plausible: TrailPoint[] = [];
  for (const point of deduplicated) {
    const previous = plausible.at(-1);
    if (!previous || isPlausibleTransition(previous, point)) plausible.push(point);
  }
  return plausible;
}

export function appendTrailPoint(
  trail: readonly TrailPoint[],
  point: TrailPosition,
  now = Date.now(),
): TrailPoint[] {
  void now;
  const next: TrailPoint = {
    lat: point.lat,
    lon: point.lon,
    recordedAt: point.recordedAt,
    altitude: point.altitude ?? null,
    groundSpeed: point.groundSpeed ?? null,
    track: point.track ?? null,
  };
  const nextAt = recordedAtMs(next);
  if (!Number.isFinite(nextAt)) return [...trail];

  const previous = trail.at(-1);
  if (previous) {
    const previousAt = recordedAtMs(previous);
    // The live tail is already chronological and sanitized. Keep appends on an
    // O(n) array-copy fast path instead of re-sorting and re-deduplicating the
    // complete trail for every SSE position update.
    if (nextAt <= previousAt) return [...trail];
    if (!isPlausibleTransition(previous, next)) return [...trail];
    if (Math.abs(previous.lat - next.lat) <= 0.00001 && Math.abs(previous.lon - next.lon) <= 0.00001) {
      return [...trail.slice(0, -1), next];
    }
  }
  return [...trail, next];
}

export function trailPointFromAircraft(aircraft: Pick<AircraftView, "lat" | "lon" | "lastSeen" | "seenSeconds" | "seenPosSeconds" | "altitude" | "groundSpeed" | "track">): TrailPoint | null {
  if (aircraft.lat === null || aircraft.lon === null) return null;
  const observedAt = positionObservedAt(aircraft);
  if (observedAt === null) return null;
  return {
    lat: aircraft.lat,
    lon: aircraft.lon,
    recordedAt: new Date(observedAt).toISOString(),
    altitude: aircraft.altitude,
    groundSpeed: aircraft.groundSpeed,
    track: aircraft.track,
  };
}

export function selectedTrail(
  trails: ReadonlyMap<string, readonly TrailPoint[]>,
  selectedIcaoHex: string | null,
  history: readonly TrailPoint[] = [],
  now = Date.now(),
): TrailPoint[] {
  if (!selectedIcaoHex) return [];
  const live = trails.get(selectedIcaoHex) ?? [];
  const liveEndpoint = live.at(-1);
  const liveEndpointAt = liveEndpoint ? recordedAtMs(liveEndpoint) : Number.POSITIVE_INFINITY;
  // History can arrive after the live stream. It may enrich the past, but it
  // must never replace the already visible live endpoint with an older point.
  const historyBeforeLive = history.filter((point) => recordedAtMs(point) <= liveEndpointAt);
  return boundTrailPoints([...historyBeforeLive, ...live], now);
}
