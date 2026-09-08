import type { AircraftView, TrailPoint } from "@/lib/aircraft/types";

export const LIVE_TRACK_WINDOW_MS = 20 * 60 * 1000;
export const LIVE_TRACK_MAX_POINTS = 120;

export type TrailPosition = Pick<TrailPoint, "lat" | "lon" | "recordedAt"> & Partial<Pick<TrailPoint, "altitude" | "groundSpeed" | "track">>;

function recordedAtMs(point: TrailPosition): number {
  return Date.parse(point.recordedAt);
}

function trailPointKey(point: TrailPosition): string {
  return `${point.recordedAt}|${point.lat}|${point.lon}`;
}

/**
 * Returns a chronological, duplicate-free and bounded trail. Invalid timestamps
 * are ignored so a malformed provider/history point cannot disturb the line.
 */
export function boundTrailPoints(points: readonly TrailPosition[], now = Date.now()): TrailPoint[] {
  const valid = points
    .map((point, index) => ({ point, index, timestamp: recordedAtMs(point) }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
  const newestTimestamp = valid.at(-1)?.timestamp ?? now;
  const cutoff = Math.max(now - LIVE_TRACK_WINDOW_MS, newestTimestamp - LIVE_TRACK_WINDOW_MS);
  const unique = new Map<string, TrailPoint>();

  for (const item of valid) {
    if (item.timestamp < cutoff) continue;
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
  return deduplicated.slice(-LIVE_TRACK_MAX_POINTS);
}

export function appendTrailPoint(
  trail: readonly TrailPoint[],
  point: TrailPosition,
  now = Date.now(),
): TrailPoint[] {
  return boundTrailPoints([...trail, point], now);
}

export function trailPointFromAircraft(aircraft: Pick<AircraftView, "lat" | "lon" | "lastSeen" | "altitude" | "groundSpeed" | "track">): TrailPoint | null {
  if (aircraft.lat === null || aircraft.lon === null) return null;
  return {
    lat: aircraft.lat,
    lon: aircraft.lon,
    recordedAt: aircraft.lastSeen,
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
  return boundTrailPoints([...(trails.get(selectedIcaoHex) ?? []), ...history], now);
}
