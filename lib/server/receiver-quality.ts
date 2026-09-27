export interface ReceiverAircraftObservation {
  seenPosSeconds: number | null;
  distanceKm: number | null;
  bearing: number | null;
  altitude: number | null;
}

export type ReceiverHealthState = "GOOD" | "DEGRADED" | "OFFLINE";
export interface ReceiverQuality {
  state: ReceiverHealthState;
  aircraftCount: number;
  messagesPerSecond: number | null;
  positionsPerSecond: number | null;
  latestMessageAgeSeconds: number | null;
  latestPositionAgeSeconds: number | null;
  maxRangeNm: number | null;
  positionQuality: { freshPositions: number; stalePositions: number; medianPositionAgeSeconds: number | null; p90PositionAgeSeconds: number | null };
}

function finite(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
function percentile(values: number[], fraction: number): number | null { if (!values.length) return null; return values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))] ?? null; }

export function buildReceiverQuality(input: {
  aircraft: readonly ReceiverAircraftObservation[];
  online: boolean;
  latestMessageAt: string | Date | null;
  latestPositionAt?: string | Date | null;
  messagesPerSecond?: number | null;
  previousPositionCount?: number | null;
  sampleIntervalSeconds?: number | null;
  now?: Date;
  freshAfterSeconds?: number;
}): ReceiverQuality {
  const now = input.now ?? new Date();
  const freshAfter = input.freshAfterSeconds ?? 60;
  const age = (value: string | Date | null | undefined): number | null => {
    const parsed = value instanceof Date ? value.getTime() : value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? Math.max(0, Math.round((now.getTime() - parsed) / 1000)) : null;
  };
  const latestMessageAgeSeconds = age(input.latestMessageAt);
  const latestPositionAgeSeconds = age(input.latestPositionAt ?? input.latestMessageAt);
  const positionAges = input.aircraft.map((aircraft) => aircraft.seenPosSeconds).filter(finite).map((value) => Math.max(0, value)).sort((a, b) => a - b);
  const freshPositions = positionAges.filter((value) => value <= freshAfter).length;
  const stalePositions = Math.max(0, positionAges.length - freshPositions);
  const maxRangeKm = input.aircraft.map((aircraft) => aircraft.distanceKm).filter(finite).reduce((max, value) => Math.max(max, value), 0);
  const positionsPerSecond = input.previousPositionCount !== null && input.previousPositionCount !== undefined && input.sampleIntervalSeconds && input.sampleIntervalSeconds > 0
    ? Math.max(0, (freshPositions - input.previousPositionCount) / input.sampleIntervalSeconds)
    : null;
  const noRecentSource = latestMessageAgeSeconds === null || latestMessageAgeSeconds > 180;
  const state: ReceiverHealthState = !input.online || noRecentSource ? "OFFLINE" : latestPositionAgeSeconds !== null && latestPositionAgeSeconds > 60 || stalePositions > freshPositions ? "DEGRADED" : "GOOD";
  return {
    state,
    aircraftCount: input.aircraft.length,
    messagesPerSecond: finite(input.messagesPerSecond) ? input.messagesPerSecond : null,
    positionsPerSecond,
    latestMessageAgeSeconds,
    latestPositionAgeSeconds,
    maxRangeNm: maxRangeKm > 0 ? Number((maxRangeKm / 1.852).toFixed(1)) : null,
    positionQuality: { freshPositions, stalePositions, medianPositionAgeSeconds: percentile(positionAges, 0.5), p90PositionAgeSeconds: percentile(positionAges, 0.9) },
  };
}

export interface ReceiverCoverageBucket { azimuthBucket: number; distanceBucketKm: number; altitudeBucketFt: number; observationCount: number; }

/** Bounded coverage aggregation; raw aircraft observations never leave this helper. */
export function aggregateReceiverCoverage(aircraft: readonly ReceiverAircraftObservation[]): ReceiverCoverageBucket[] {
  const buckets = new Map<string, ReceiverCoverageBucket>();
  for (const item of aircraft) {
    if (!finite(item.bearing) || !finite(item.distanceKm) || !finite(item.altitude)) continue;
    const azimuthBucket = Math.floor(((item.bearing + 360) % 360) / 10) * 10;
    const distanceBucketKm = Math.floor(item.distanceKm / 25) * 25;
    const altitudeBucketFt = Math.floor(item.altitude / 5_000) * 5_000;
    const key = `${azimuthBucket}:${distanceBucketKm}:${altitudeBucketFt}`;
    const previous = buckets.get(key);
    if (previous) previous.observationCount += 1;
    else buckets.set(key, { azimuthBucket, distanceBucketKm, altitudeBucketFt, observationCount: 1 });
  }
  return [...buckets.values()].sort((a, b) => a.azimuthBucket - b.azimuthBucket || a.distanceBucketKm - b.distanceBucketKm || a.altitudeBucketFt - b.altitudeBucketFt);
}
