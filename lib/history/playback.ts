export interface PlaybackPosition {
  recordedAt: string;
  lat: number;
  lon: number;
  altitude: number | null;
  groundSpeed: number | null;
  track: number | null;
  verticalRate?: number | null;
}

export interface PlaybackSample {
  timestamp: number;
  lat: number;
  lon: number;
  altitude: number | null;
  groundSpeed: number | null;
  track: number | null;
  verticalRate: number | null;
  index: number;
}

function timestamp(position: PlaybackPosition): number {
  return Date.parse(position.recordedAt);
}

export function playbackTimeRange(positions: PlaybackPosition[]): { start: number; end: number } | null {
  if (!positions.length) return null;
  return { start: timestamp(positions[0]), end: timestamp(positions[positions.length - 1]) };
}

export function playbackSampleAt(positions: PlaybackPosition[], requestedTimestamp: number): PlaybackSample | null {
  if (!positions.length) return null;
  const first = positions[0];
  const firstTimestamp = timestamp(first);
  if (requestedTimestamp <= firstTimestamp) {
    return { ...first, timestamp: firstTimestamp, verticalRate: first.verticalRate ?? null, index: 0 };
  }

  const lastIndex = positions.length - 1;
  const last = positions[lastIndex];
  const lastTimestamp = timestamp(last);
  if (requestedTimestamp >= lastTimestamp) {
    return { ...last, timestamp: lastTimestamp, verticalRate: last.verticalRate ?? null, index: lastIndex };
  }

  for (let index = 1; index < positions.length; index += 1) {
    const next = positions[index];
    const nextTimestamp = timestamp(next);
    if (requestedTimestamp > nextTimestamp) continue;
    const previous = positions[index - 1];
    const previousTimestamp = timestamp(previous);
    const duration = nextTimestamp - previousTimestamp;
    const ratio = duration > 0 ? (requestedTimestamp - previousTimestamp) / duration : 1;
    const nearestIndex = ratio < 0.5 ? index - 1 : index;
    const nearest = positions[nearestIndex];
    return {
      timestamp: requestedTimestamp,
      lat: previous.lat + (next.lat - previous.lat) * ratio,
      lon: previous.lon + (next.lon - previous.lon) * ratio,
      altitude: nearest.altitude,
      groundSpeed: nearest.groundSpeed,
      track: nearest.track,
      verticalRate: nearest.verticalRate ?? null,
      index: nearestIndex,
    };
  }

  return { ...last, timestamp: lastTimestamp, verticalRate: last.verticalRate ?? null, index: lastIndex };
}
