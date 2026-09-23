import { destinationPoint, haversineDistanceKm, initialBearing } from "@/lib/geo";

export const KNOT_TO_KM_PER_HOUR = 1.852;
export const MAX_PREDICTION_AGE_MS = 8_000;
export const MOTION_OBSERVATION_TOLERANCE_MS = 100;
export const MAX_PREDICTION_CORRECTION_KM = 12;
export const AIRCRAFT_ICON_ROTATION_OFFSET_DEG = 0;
export const MIN_VISUAL_HEADING_DISTANCE_KM = 0.025;
export const MAX_TURN_RATE_DEG_PER_SEC = 12;
export const MIN_TURN_OBSERVATION_GAP_MS = 250;
export const MAX_TURN_OBSERVATION_GAP_MS = 12_000;
export const HIGH_DENSITY_MOTION_THRESHOLD = 80;
export const HIGH_DENSITY_MOTION_FRAME_MS = 1_000 / 30;

export type MotionSource = {
  lat: number; lon: number; observedAt: number | null; receivedAt?: number;
  groundSpeed: number | null; track: number | null;
  positionOrigin?: string | null; positionSource?: string | null;
  allowPrediction?: boolean;
};

export type MotionResult = { lon: number; lat: number; heading: number | null; predictionActive: boolean; correctionActive: boolean; stale: boolean };
export type MotionHistory = { lastTrack: number | null; previousTrack: number | null; lastObservedAt: number | null; previousObservedAt: number | null; turnRateDegPerSec: number; positionHeading: number | null; lastLat: number | null; lastLon: number | null; source: string | null };

export function createMotionHistory(): MotionHistory {
  return { lastTrack: null, previousTrack: null, lastObservedAt: null, previousObservedAt: null, turnRateDegPerSec: 0, positionHeading: null, lastLat: null, lastLon: null, source: null };
}

export function updateMotionHistory(history: MotionHistory, source: MotionSource): MotionHistory {
  // MotionHistory is owned by the animation job. Return a new value for every
  // update so a reset cannot leave a caller mutating the pre-reset object.
  const next = { ...history };
  const sourceKey = `${source.positionOrigin ?? ""}:${source.positionSource ?? ""}`;
  if (next.source !== null && next.source !== sourceKey) return Object.assign(createMotionHistory(), { source: sourceKey, lastLat: source.lat, lastLon: source.lon });
  // A source without a trusted observation timestamp cannot advance the
  // confirmed motion state while an aircraft is stale.
  if (source.observedAt === null) return next;
  // Position observations are monotonic. A delayed packet must not move the
  // motion history (or its turn estimate) back in time.
  if (next.lastObservedAt !== null && source.observedAt <= next.lastObservedAt) return next;
  next.source = sourceKey;
  if (next.lastLat !== null && next.lastLon !== null) {
    const jump = haversineDistanceKm(next.lastLat, next.lastLon, source.lat, source.lon);
    if (jump > MAX_PREDICTION_CORRECTION_KM) return Object.assign(createMotionHistory(), { source: sourceKey, lastLat: source.lat, lastLon: source.lon });
    if (jump >= MIN_VISUAL_HEADING_DISTANCE_KM) next.positionHeading = normalizeHeading(initialBearing(next.lastLat, next.lastLon, source.lat, source.lon));
  }
  if (source.track !== null) {
    if (next.lastTrack !== null && next.lastObservedAt !== null) {
      const gap = source.observedAt - next.lastObservedAt;
      if (gap >= MIN_TURN_OBSERVATION_GAP_MS && gap <= MAX_TURN_OBSERVATION_GAP_MS) {
        const rate = shortestAngleDelta(next.lastTrack, source.track) / (gap / 1000);
        if (Math.abs(rate) <= MAX_TURN_RATE_DEG_PER_SEC) next.turnRateDegPerSec = next.turnRateDegPerSec * 0.7 + rate * 0.3;
      }
    }
    next.previousTrack = next.lastTrack; next.previousObservedAt = next.lastObservedAt;
    next.lastTrack = normalizeHeading(source.track); next.lastObservedAt = source.observedAt;
  } else next.lastObservedAt = source.observedAt;
  next.lastLat = source.lat; next.lastLon = source.lon;
  return next;
}

/**
 * Resolves the presentation heading for a confirmed position update. The
 * current rendered movement is deliberately preferred to the reported track:
 * interpolation can be correcting the marker along a different path than the
 * latest ADS-B kinematic observation describes.
 */
export function visualHeadingForConfirmedPosition(
  current: { lat: number; lon: number },
  source: MotionSource,
  history?: MotionHistory,
): number | null {
  const distance = haversineDistanceKm(current.lat, current.lon, source.lat, source.lon);
  const renderedMovementHeading = distance >= MIN_VISUAL_HEADING_DISTANCE_KM
    ? initialBearing(current.lat, current.lon, source.lat, source.lon)
    : null;
  return normalizeHeading(renderedMovementHeading)
    ?? history?.positionHeading
    ?? normalizeHeading(source.track)
    ?? history?.lastTrack
    ?? null;
}

export function motionRenderIntervalMs(activeAircraft: number): number {
  return activeAircraft >= HIGH_DENSITY_MOTION_THRESHOLD ? HIGH_DENSITY_MOTION_FRAME_MS : 0;
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
  if (source.allowPrediction === false || source.observedAt === null || timestamp - source.observedAt > MAX_PREDICTION_AGE_MS) return [source.lon, source.lat];
  const speed = source.groundSpeed;
  const heading = normalizeHeading(source.track) ?? history?.lastTrack ?? null;
  if (speed === null || !Number.isFinite(speed) || speed < 0.5 || heading === null) return [source.lon, source.lat];
  const elapsed = Math.min(MAX_PREDICTION_AGE_MS, Math.max(0, timestamp - source.observedAt));
  // Keep visual dead reckoning deliberately simple and stable. Inferring a
  // curved path from noisy ADS-B track deltas makes markers "hunt" around the
  // actual trajectory and then correct back on every confirmed position.
  return destinationPoint(source.lat, source.lon, speed * KNOT_TO_KM_PER_HOUR * elapsed / 3_600_000, heading);
}

export function confirmedInterpolationDurationMs(
  previous: MotionSource,
  next: MotionSource,
  receivedGapMs: number,
  minimumMs = 300,
  maximumMs = 12_000,
): number {
  const observedGap = previous.observedAt !== null
    && next.observedAt !== null
    && next.observedAt > previous.observedAt
    ? next.observedAt - previous.observedAt
    : null;
  // Render against the cadence at which confirmed positions actually reach
  // the browser. The raw observation cadence (seen_pos) is intentionally not
  // preferred here: ADS-B position frames arrive irregularly and using that
  // interval directly makes marker speed pulse even when snapshots reach the
  // client at a steady rate.
  const deliveryGap = Number.isFinite(receivedGapMs) && receivedGapMs > 0
    ? receivedGapMs
    : observedGap ?? minimumMs;
  // Keep the interpolation alive just beyond the expected next delivery.
  // A small overlap avoids the old move-stop-move rhythm without building up
  // meaningful visual latency: the next confirmed point retargets from the
  // marker's currently rendered position.
  return Math.min(maximumMs, Math.max(minimumMs, deliveryGap * 1.08));
}

export function motionObservationAdvances(previous: MotionSource, next: MotionSource): boolean {
  const previousSource = `${previous.positionOrigin ?? ""}:${previous.positionSource ?? ""}`;
  const nextSource = `${next.positionOrigin ?? ""}:${next.positionSource ?? ""}`;
  if (previousSource !== nextSource) return true;
  if (previous.observedAt === null || next.observedAt === null) return true;
  return next.observedAt > previous.observedAt + MOTION_OBSERVATION_TOLERANCE_MS;
}

export function predictionIsActive(source: MotionSource, timestamp: number, history?: MotionHistory): boolean {
  const heading = normalizeHeading(source.track) ?? history?.lastTrack ?? null;
  return source.allowPrediction !== false && source.observedAt !== null && timestamp >= source.observedAt && timestamp - source.observedAt <= MAX_PREDICTION_AGE_MS
    && source.groundSpeed !== null && Number.isFinite(source.groundSpeed) && source.groundSpeed >= 0.5 && heading !== null;
}

export function motionAt(source: MotionSource, timestamp: number, correction?: { lon: number; lat: number; startedAt: number; durationMs: number }, history?: MotionHistory, visualHeading?: number | null): MotionResult {
  const [lon, lat] = predictedPosition(source, timestamp, history);
  const stale = source.observedAt === null || timestamp - source.observedAt > MAX_PREDICTION_AGE_MS;
  const progress = correction ? Math.max(0, Math.min(1, (timestamp - correction.startedAt) / correction.durationMs)) : 1;
  const active = Boolean(correction && progress < 1 && (source.allowPrediction === false || !stale));
  const baseHeading = normalizeHeading(visualHeading) ?? history?.positionHeading ?? normalizeHeading(source.track) ?? history?.lastTrack ?? null;
  // Render the stored visual/fallback course directly. Extrapolating visual
  // heading with an inferred turn rate causes obvious over-rotation when track
  // jitters.
  const heading = baseHeading;
  return { lon: normalizeLongitude(lon + (correction?.lon ?? 0) * (1 - progress)), lat: lat + (correction?.lat ?? 0) * (1 - progress), heading, predictionActive: predictionIsActive(source, timestamp, history), correctionActive: active, stale };
}

export function correctionFor(current: { lon: number; lat: number }, source: MotionSource, timestamp: number, durationMs: number, history?: MotionHistory) {
  if (source.observedAt === null || timestamp < source.observedAt) return null;
  // Prediction must stop after the stale horizon, but confirmed-position
  // interpolation is different: a slow provider may legitimately deliver a
  // newer confirmed point whose observation time is already older than the
  // prediction horizon. Rejecting that point here turns a smooth interpolation
  // into an immediate marker snap.
  if (source.allowPrediction !== false && timestamp - source.observedAt > MAX_PREDICTION_AGE_MS) return null;
  const [lon, lat] = predictedPosition(source, timestamp, history);
  const distance = haversineDistanceKm(current.lat, current.lon, lat, lon);
  if (distance > MAX_PREDICTION_CORRECTION_KM) return null;
  return { lon: shortestLongitudeDelta(current.lon, lon), lat: current.lat - lat, startedAt: timestamp, durationMs };
}
