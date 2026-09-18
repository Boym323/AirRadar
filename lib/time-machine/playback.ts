export const TIME_MACHINE_MAX_INTERPOLATION_GAP_MS = 30_000;
export const TIME_MACHINE_STALE_AFTER_MS = 45_000;

export interface HistoricalObservation {
  timestamp: string;
  lat: number;
  lon: number;
  altitude: number | null;
  speed: number | null;
  track: number | null;
}

export interface HistoricalAircraftTrack {
  id: string;
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  flightId: number | null;
  origin: string | null;
  destination: string | null;
  positions: HistoricalObservation[];
}

export interface HistoricalAircraftSample extends Omit<HistoricalObservation, "timestamp"> {
  id: string;
  timestamp: number;
  flightId: number | null;
  callsign: string | null;
  registration: string | null;
  type: string | null;
}

function time(value: string): number { return Date.parse(value); }

function shortestAngle(from: number, to: number, ratio: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * ratio + 360) % 360;
}

export function sampleHistoricalAircraft(track: HistoricalAircraftTrack, at: number): HistoricalAircraftSample | null {
  if (!track.positions.length) return null;
  const first = track.positions[0];
  const firstAt = time(first.timestamp);
  const last = track.positions[track.positions.length - 1];
  const lastAt = time(last.timestamp);
  if (at < firstAt || at > lastAt + TIME_MACHINE_STALE_AFTER_MS) return null;
  if (at >= lastAt) return { ...last, id: track.id, timestamp: lastAt, flightId: track.flightId, callsign: track.callsign, registration: track.registration, type: track.type };
  let nextIndex = 1;
  while (nextIndex < track.positions.length && time(track.positions[nextIndex].timestamp) < at) nextIndex += 1;
  const previous = track.positions[nextIndex - 1];
  const next = track.positions[nextIndex];
  const previousAt = time(previous.timestamp);
  const nextAt = time(next.timestamp);
  if (at === nextAt) return { ...next, id: track.id, timestamp: nextAt, flightId: track.flightId, callsign: track.callsign, registration: track.registration, type: track.type };
  const gap = nextAt - previousAt;
  if (gap <= 0 || gap > TIME_MACHINE_MAX_INTERPOLATION_GAP_MS) return null;
  const ratio = Math.max(0, Math.min(1, (at - previousAt) / gap));
  return {
    id: track.id,
    timestamp: at,
    lat: previous.lat + (next.lat - previous.lat) * ratio,
    lon: previous.lon + (next.lon - previous.lon) * ratio,
    altitude: previous.altitude === null || next.altitude === null ? (ratio < .5 ? previous.altitude : next.altitude) : previous.altitude + (next.altitude - previous.altitude) * ratio,
    speed: previous.speed === null || next.speed === null ? (ratio < .5 ? previous.speed : next.speed) : previous.speed + (next.speed - previous.speed) * ratio,
    track: previous.track === null || next.track === null ? (ratio < .5 ? previous.track : next.track) : shortestAngle(previous.track, next.track, ratio),
    flightId: track.flightId,
    callsign: track.callsign,
    registration: track.registration,
    type: track.type,
  };
}

export function sampleHistoricalTraffic(tracks: HistoricalAircraftTrack[], at: number): HistoricalAircraftSample[] {
  return tracks.flatMap((track) => { const sample = sampleHistoricalAircraft(track, at); return sample ? [sample] : []; });
}

export function playbackClock(current: number, elapsedMs: number, speed: number, end: number): number {
  return Math.min(end, current + Math.max(0, elapsedMs) * speed);
}
