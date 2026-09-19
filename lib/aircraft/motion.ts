import { destinationPoint, haversineDistanceKm, initialBearing } from "@/lib/geo";

export const AIRCRAFT_ICON_ROTATION_OFFSET_DEG = 0;
export const MAX_MOTION_OBSERVATION_AGE_MS = 15_000;
export const MAX_TURN_RATE_DEG_PER_SEC = 12;
export const MIN_TURN_OBSERVATION_INTERVAL_MS = 250;
export const MIN_TURN_DISTANCE_KM = 0.02;
export const LOW_SPEED_KT = 0.5;

export interface MotionObservation {
  lat: number;
  lon: number;
  observedAt: number;
  groundSpeed: number | null;
  track: number | null;
  sourceKey: string;
}

export interface MotionHistory {
  sourceKey: string;
  lastObservationAt: number;
  previousTrack: number | null;
  previousTrackAt: number | null;
  lastTrack: number | null;
  lastTrackAt: number | null;
  turnRateDegPerSec: number;
  lastRenderHeading: number | null;
  previousPosition: { lat: number; lon: number; observedAt: number } | null;
}

export interface MotionResult {
  lng: number;
  lat: number;
  track: number | null;
}

export function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function createMotionHistory(observation: MotionObservation): MotionHistory {
  const track = validTrack(observation.track);
  return {
    sourceKey: observation.sourceKey,
    lastObservationAt: observation.observedAt,
    previousTrack: null,
    previousTrackAt: null,
    lastTrack: track,
    lastTrackAt: track === null ? null : observation.observedAt,
    turnRateDegPerSec: 0,
    lastRenderHeading: track,
    previousPosition: { lat: observation.lat, lon: observation.lon, observedAt: observation.observedAt },
  };
}

function validTrack(track: number | null): number | null {
  return track !== null && Number.isFinite(track) ? normalizeHeading(track) : null;
}

function filteredTurnRate(previous: number, next: number, elapsedMs: number): number {
  if (elapsedMs < MIN_TURN_OBSERVATION_INTERVAL_MS) return 0;
  const raw = shortestAngleDelta(previous, next) / (elapsedMs / 1000);
  if (!Number.isFinite(raw) || Math.abs(raw) > MAX_TURN_RATE_DEG_PER_SEC) return 0;
  return raw;
}

/** Update only from provider observations, never from animation frames. */
export function updateMotionHistory(history: MotionHistory, observation: MotionObservation): MotionHistory {
  if (history.sourceKey !== observation.sourceKey) return createMotionHistory(observation);
  const next = { ...history, lastObservationAt: observation.observedAt };
  const track = validTrack(observation.track);
  if (track !== null && observation.observedAt > (history.lastTrackAt ?? -Infinity)) {
    if (history.lastTrack !== null && history.lastTrackAt !== null) {
      const rawRate = filteredTurnRate(history.lastTrack, track, observation.observedAt - history.lastTrackAt);
      if (rawRate !== 0 || shortestAngleDelta(history.lastTrack, track) === 0) {
        next.turnRateDegPerSec = next.turnRateDegPerSec * 0.7 + rawRate * 0.3;
      }
      next.previousTrack = history.lastTrack;
      next.previousTrackAt = history.lastTrackAt;
    }
    next.lastTrack = track;
    next.lastTrackAt = observation.observedAt;
    next.lastRenderHeading = track;
  }
  if (history.previousPosition && observation.observedAt > history.previousPosition.observedAt
    && haversineDistanceKm(history.previousPosition.lat, history.previousPosition.lon, observation.lat, observation.lon) >= MIN_TURN_DISTANCE_KM) {
    const positionBearing = initialBearing(history.previousPosition.lat, history.previousPosition.lon, observation.lat, observation.lon);
    if (track === null && (observation.groundSpeed ?? 0) >= LOW_SPEED_KT) next.lastRenderHeading = positionBearing;
  }
  next.previousPosition = { lat: observation.lat, lon: observation.lon, observedAt: observation.observedAt };
  return next;
}

function integrateTurn(observation: MotionObservation, history: MotionHistory, elapsedSeconds: number): [number, number] {
  const speedKt = observation.groundSpeed;
  const speedKmPerSecond = speedKt !== null && Number.isFinite(speedKt) && speedKt >= LOW_SPEED_KT
    ? speedKt * 1.852 / 3600
    : 0;
  if (speedKmPerSecond === 0) return [observation.lon, observation.lat];
  const rate = history.turnRateDegPerSec;
  const segments = Math.max(1, Math.min(12, Math.ceil(elapsedSeconds / 0.5)));
  const stepSeconds = elapsedSeconds / segments;
  let lat = observation.lat;
  let lon = observation.lon;
  for (let index = 0; index < segments; index += 1) {
    const heading = normalizeHeading((history.lastTrack ?? history.lastRenderHeading ?? 0) + rate * (index * stepSeconds + stepSeconds / 2));
    [lon, lat] = destinationPoint(lat, lon, speedKmPerSecond * stepSeconds, heading);
  }
  return [lon, lat];
}

export function predictedAircraftMotion(
  observation: MotionObservation,
  history: MotionHistory,
  timestamp: number,
  correctionLon = 0,
  correctionLat = 0,
  correctionWeight = 0,
): MotionResult {
  const ageMs = Math.min(MAX_MOTION_OBSERVATION_AGE_MS, Math.max(0, timestamp - observation.observedAt));
  const elapsedSeconds = ageMs / 1000;
  const reliableTurn = history.lastTrack !== null && Math.abs(history.turnRateDegPerSec) > 0.01
    && timestamp - (history.lastTrackAt ?? timestamp) <= MAX_MOTION_OBSERVATION_AGE_MS;
  const [lng, lat] = reliableTurn
    ? integrateTurn(observation, history, elapsedSeconds)
    : observation.groundSpeed !== null && Number.isFinite(observation.groundSpeed) && observation.groundSpeed >= LOW_SPEED_KT && history.lastRenderHeading !== null
      ? destinationPoint(observation.lat, observation.lon, observation.groundSpeed * 1.852 * elapsedSeconds / 3600, history.lastRenderHeading)
      : [observation.lon, observation.lat];
  const track = history.lastRenderHeading === null
    ? null
    : normalizeHeading(history.lastRenderHeading + (reliableTurn ? history.turnRateDegPerSec * elapsedSeconds : 0) + AIRCRAFT_ICON_ROTATION_OFFSET_DEG);
  return { lng: ((lng + correctionLon * correctionWeight + 540) % 360) - 180, lat: lat + correctionLat * correctionWeight, track };
}
