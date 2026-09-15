import type { AircraftView, TrailPoint } from "@/lib/aircraft/types";

export type TrailPosition = Pick<TrailPoint, "lat" | "lon" | "recordedAt"> & Partial<Pick<TrailPoint, "altitude" | "groundSpeed" | "track">>;

function recordedAtMs(point: TrailPosition): number {
  return Date.parse(point.recordedAt);
}

function trailPointKey(point: TrailPosition): string {
  return `${point.recordedAt}|${point.lat}|${point.lon}`;
}

/**
 * Returns a chronological, duplicate-free trail. Invalid timestamps are ignored
 * so a malformed provider/history point cannot disturb the line. The trail is
 * retained for as long as its aircraft remains present in the live state.
 */
export function boundTrailPoints(points: readonly TrailPosition[], now = Date.now()): TrailPoint[] {
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
  return deduplicated;
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
