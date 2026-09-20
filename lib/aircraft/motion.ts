import { destinationPoint, haversineDistanceKm } from "@/lib/geo";

export const KNOT_TO_KM_PER_HOUR = 1.852;
export const MAX_PREDICTION_AGE_MS = 15_000;
export const MAX_PREDICTION_CORRECTION_KM = 12;
export const AIRCRAFT_ICON_ROTATION_OFFSET_DEG = 0;
export const MAX_TURN_RATE_DEG_PER_SEC = 12;
export const MIN_TURN_OBSERVATION_GAP_MS = 250;
export const MAX_TURN_OBSERVATION_GAP_MS = 12_000;

export type MotionSource = {
  lat: number; lon: number; observedAt: number | null; receivedAt?: number;
  groundSpeed: number | null; track: number | null;
  positionOrigin?: string | null; positionSource?: string | null;
};

export type MotionResult = { lon: number; lat: number; heading: number | null; predictionActive: boolean; correctionActive: boolean; stale: boolean };
export type MotionHistory = { lastTrack: number | null; previousTrack: number | null; lastObservedAt: number | null; previousObservedAt: number | null; turnRateDegPerSec: number; lastLat: number | null; lastLon: number | null; source: string | null };

export function createMotionHistory(): MotionHistory {
  return { lastTrack: null, previousTrack: null, lastObservedAt: null, previousObservedAt: null, turnRateDegPerSec: 0, lastLat: null, lastLon: null, source: null };
}

export function updateMotionHistory(history: MotionHistory, source: MotionSource): MotionHistory {
  // MotionHistory is owned by the animation job. Return a new value for every
  // update so a reset cannot leave a caller mutating the pre-reset object.
  const next = { ...history };
  const sourceKey = `${source.positionOrigin ?? ""}:${source.positionSource ?? ""}`;
  if (next.source !== null && next.source !== sourceKey) return Object.assign(createMotionHistory(), { source: sourceKey, lastLat: source.lat, lastLon: source.lon });
  next.source = sourceKey;
  if (next.lastLat !== null && next.lastLon !== null) {
    const jump = haversineDistanceKm(next.lastLat, next.lastLon, source.lat, source.lon);
    if (jump > MAX_PREDICTION_CORRECTION_KM) return Object.assign(createMotionHistory(), { source: sourceKey, lastLat: source.lat, lastLon: source.lon });
  }
  if (source.track !== null && source.observedAt !== null && (next.lastObservedAt === null || source.observedAt > next.lastObservedAt)) {
    if (next.lastTrack !== null && next.lastObservedAt !== null) {
      const gap = source.observedAt - next.lastObservedAt;
      if (gap >= MIN_TURN_OBSERVATION_GAP_MS && gap <= MAX_TURN_OBSERVATION_GAP_MS) {
        const rate = shortestAngleDelta(next.lastTrack, source.track) / (gap / 1000);
        if (Math.abs(rate) <= MAX_TURN_RATE_DEG_PER_SEC) next.turnRateDegPerSec = next.turnRateDegPerSec * 0.7 + rate * 0.3;
      }
    }
    next.previousTrack = next.lastTrack; next.previousObservedAt = next.lastObservedAt;
    next.lastTrack = normalizeHeading(source.track); next.lastObservedAt = source.observedAt;
  }
  next.lastLat = source.lat; next.lastLon = source.lon;
  return next;
}

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

export function predictedPosition(source: MotionSource, timestamp: number, history?: MotionHistory): [number, number] {
  if (source.observedAt === null || timestamp - source.observedAt > MAX_PREDICTION_AGE_MS) return [source.lon, source.lat];
  const speed = source.groundSpeed; const heading = normalizeHeading(source.track) ?? history?.lastTrack ?? null;
  if (speed === null || !Number.isFinite(speed) || speed < 0.5 || heading === null) return [source.lon, source.lat];
  const elapsed = Math.min(MAX_PREDICTION_AGE_MS, Math.max(0, timestamp - source.observedAt));
  const turnRate = history?.turnRateDegPerSec ?? 0;
  if (!history || Math.abs(turnRate) < 0.05) return destinationPoint(source.lat, source.lon, speed * KNOT_TO_KM_PER_HOUR * elapsed / 3_600_000, heading);
  let lat = source.lat; let lon = source.lon; let course = heading;
  const stepMs = 250;
  for (let remaining = elapsed; remaining > 0; remaining -= stepMs) {
    const dt = Math.min(stepMs, remaining) / 1000;
    [lon, lat] = destinationPoint(lat, lon, speed * KNOT_TO_KM_PER_HOUR * dt / 3600, course);
    course = normalizeHeading(course + turnRate * dt)!;
  }
  return [lon, lat];
}

export function predictionIsActive(source: MotionSource, timestamp: number, history?: MotionHistory): boolean {
  const heading = normalizeHeading(source.track) ?? history?.lastTrack ?? null;
  return source.observedAt !== null && timestamp >= source.observedAt && timestamp - source.observedAt <= MAX_PREDICTION_AGE_MS
    && source.groundSpeed !== null && Number.isFinite(source.groundSpeed) && source.groundSpeed >= 0.5 && heading !== null;
}

export function motionAt(source: MotionSource, timestamp: number, correction?: { lon: number; lat: number; startedAt: number; durationMs: number }, history?: MotionHistory): MotionResult {
  const [lon, lat] = predictedPosition(source, timestamp, history);
  const stale = source.observedAt === null || timestamp - source.observedAt > MAX_PREDICTION_AGE_MS;
  const progress = correction ? Math.max(0, Math.min(1, (timestamp - correction.startedAt) / correction.durationMs)) : 1;
  const active = Boolean(correction && progress < 1 && !stale);
  const baseHeading = normalizeHeading(source.track) ?? history?.lastTrack ?? null;
  const heading = baseHeading === null ? null : normalizeHeading(baseHeading + (history?.turnRateDegPerSec ?? 0) * Math.max(0, timestamp - (source.observedAt ?? timestamp)) / 1000);
  return { lon: normalizeLongitude(lon + (correction?.lon ?? 0) * (1 - progress)), lat: lat + (correction?.lat ?? 0) * (1 - progress), heading, predictionActive: predictionIsActive(source, timestamp, history), correctionActive: active, stale };
}

export function correctionFor(current: { lon: number; lat: number }, source: MotionSource, timestamp: number, durationMs: number) {
  const [lon, lat] = predictedPosition(source, timestamp);
  const distance = haversineDistanceKm(current.lat, current.lon, lat, lon);
  if (distance > MAX_PREDICTION_CORRECTION_KM || source.observedAt === null) return null;
  return { lon: shortestLongitudeDelta(current.lon, lon), lat: current.lat - lat, startedAt: timestamp, durationMs };
}
