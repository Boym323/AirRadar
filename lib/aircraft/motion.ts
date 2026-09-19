import { destinationPoint, haversineDistanceKm } from "@/lib/geo";

export const KNOT_TO_KM_PER_HOUR = 1.852;
export const MAX_PREDICTION_AGE_MS = 15_000;
export const MAX_PREDICTION_CORRECTION_KM = 12;

export type MotionSource = {
  lat: number; lon: number; observedAt: number | null; receivedAt?: number;
  groundSpeed: number | null; track: number | null;
  positionOrigin?: string | null; positionSource?: string | null;
};

export type MotionResult = { lon: number; lat: number; heading: number | null; predictionActive: boolean; correctionActive: boolean; stale: boolean };

export function normalizeHeading(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : ((value % 360) + 360) % 360;
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function interpolateHeading(from: number, to: number, progress: number): number {
  return normalizeHeading(from + shortestAngleDelta(from, to) * Math.max(0, Math.min(1, progress)))!;
}

export function normalizeLongitude(value: number): number { return ((value + 540) % 360) - 180; }
export function shortestLongitudeDelta(from: number, to: number): number {
  let delta = from - to; if (delta > 180) delta -= 360; if (delta < -180) delta += 360; return delta;
}

export function predictedPosition(source: MotionSource, timestamp: number): [number, number] {
  if (source.observedAt === null || timestamp - source.observedAt > MAX_PREDICTION_AGE_MS) return [source.lon, source.lat];
  const speed = source.groundSpeed; const heading = normalizeHeading(source.track);
  if (speed === null || !Number.isFinite(speed) || speed < 0.5 || heading === null) return [source.lon, source.lat];
  return destinationPoint(source.lat, source.lon, speed * KNOT_TO_KM_PER_HOUR * Math.max(0, timestamp - source.observedAt) / 3_600_000, heading);
}

export function predictionIsActive(source: MotionSource, timestamp: number): boolean {
  const heading = normalizeHeading(source.track);
  return source.observedAt !== null && timestamp >= source.observedAt && timestamp - source.observedAt <= MAX_PREDICTION_AGE_MS
    && source.groundSpeed !== null && Number.isFinite(source.groundSpeed) && source.groundSpeed >= 0.5 && heading !== null;
}

export function motionAt(source: MotionSource, timestamp: number, correction?: { lon: number; lat: number; startedAt: number; durationMs: number }): MotionResult {
  const [lon, lat] = predictedPosition(source, timestamp);
  const stale = source.observedAt === null || timestamp - source.observedAt > MAX_PREDICTION_AGE_MS;
  const progress = correction ? Math.max(0, Math.min(1, (timestamp - correction.startedAt) / correction.durationMs)) : 1;
  const active = Boolean(correction && progress < 1 && !stale);
  return { lon: normalizeLongitude(lon + (correction?.lon ?? 0) * (1 - progress)), lat: lat + (correction?.lat ?? 0) * (1 - progress), heading: normalizeHeading(source.track), predictionActive: predictionIsActive(source, timestamp), correctionActive: active, stale };
}

export function correctionFor(current: { lon: number; lat: number }, source: MotionSource, timestamp: number, durationMs: number) {
  const [lon, lat] = predictedPosition(source, timestamp);
  const distance = haversineDistanceKm(current.lat, current.lon, lat, lon);
  if (distance > MAX_PREDICTION_CORRECTION_KM || source.observedAt === null) return null;
  return { lon: shortestLongitudeDelta(current.lon, lon), lat: current.lat - lat, startedAt: timestamp, durationMs };
}
