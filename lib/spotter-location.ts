import type { AircraftView } from "@/lib/aircraft/types";

const EARTH_RADIUS_KM = 6371.0088;
const FEET_TO_METERS = 0.3048;

export interface SpotterObserverPosition {
  lat: number;
  lon: number;
  altitudeMeters: number | null;
  accuracyMeters: number | null;
  capturedAt: string;
}

export interface SpotterObserverGeometry {
  horizontalDistanceKm: number;
  bearingDeg: number;
  slantDistanceKm: number | null;
  elevationDeg: number | null;
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

function toDegrees(value: number): number {
  return value * 180 / Math.PI;
}

export function normalizeBearing(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function haversineDistanceKm(
  from: Pick<SpotterObserverPosition, "lat" | "lon">,
  to: { lat: number; lon: number },
): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(to.lon - from.lon);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function initialBearingDeg(
  from: Pick<SpotterObserverPosition, "lat" | "lon">,
  to: { lat: number; lon: number },
): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

export function observerGeometry(
  aircraft: Pick<AircraftView, "lat" | "lon" | "altitude">,
  observer: SpotterObserverPosition,
): SpotterObserverGeometry | null {
  if (
    aircraft.lat === null
    || aircraft.lon === null
    || !Number.isFinite(aircraft.lat)
    || !Number.isFinite(aircraft.lon)
  ) return null;

  const horizontalDistanceKm = haversineDistanceKm(observer, {
    lat: aircraft.lat,
    lon: aircraft.lon,
  });
  const bearingDeg = initialBearingDeg(observer, {
    lat: aircraft.lat,
    lon: aircraft.lon,
  });

  if (aircraft.altitude === null || observer.altitudeMeters === null) {
    return {
      horizontalDistanceKm,
      bearingDeg,
      slantDistanceKm: null,
      elevationDeg: null,
    };
  }

  const verticalMeters = aircraft.altitude * FEET_TO_METERS - observer.altitudeMeters;
  const horizontalMeters = horizontalDistanceKm * 1000;
  const slantDistanceKm = Math.hypot(horizontalMeters, verticalMeters) / 1000;
  const elevationDeg = toDegrees(Math.atan2(verticalMeters, Math.max(horizontalMeters, 0.1)));

  return {
    horizontalDistanceKm,
    bearingDeg,
    slantDistanceKm,
    elevationDeg,
  };
}

export function observerFromGeolocation(position: GeolocationPosition): SpotterObserverPosition {
  return {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    altitudeMeters: position.coords.altitude,
    accuracyMeters: position.coords.accuracy,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

export type SpotterPassPhase = "approaching" | "overhead" | "departing" | "unknown";

export interface SpotterClosestApproach {
  secondsUntilClosest: number;
  currentHorizontalDistanceKm: number;
  closestHorizontalDistanceKm: number;
  closestSlantDistanceKm: number | null;
  elevationAtClosestDeg: number | null;
  phase: SpotterPassPhase;
}

const KNOT_TO_METERS_PER_SECOND = 0.514444;
const FEET_PER_MINUTE_TO_METERS_PER_SECOND = 0.00508;

export function predictClosestApproach(
  aircraft: Pick<AircraftView, "lat" | "lon" | "altitude" | "groundSpeed" | "track" | "verticalRate">,
  observer: SpotterObserverPosition,
  horizonSeconds = 10 * 60,
): SpotterClosestApproach | null {
  const geometry = observerGeometry(aircraft, observer);
  if (!geometry) return null;

  const speedKt = aircraft.groundSpeed;
  const trackDeg = aircraft.track;
  if (
    speedKt === null
    || trackDeg === null
    || !Number.isFinite(speedKt)
    || !Number.isFinite(trackDeg)
    || speedKt <= 1
  ) {
    return {
      secondsUntilClosest: 0,
      currentHorizontalDistanceKm: geometry.horizontalDistanceKm,
      closestHorizontalDistanceKm: geometry.horizontalDistanceKm,
      closestSlantDistanceKm: geometry.slantDistanceKm,
      elevationAtClosestDeg: geometry.elevationDeg,
      phase: geometry.horizontalDistanceKm <= 1 ? "overhead" : "unknown",
    };
  }

  const distanceMeters = geometry.horizontalDistanceKm * 1000;
  const bearingRad = toRadians(geometry.bearingDeg);
  const x = Math.sin(bearingRad) * distanceMeters;
  const y = Math.cos(bearingRad) * distanceMeters;

  const speedMs = speedKt * KNOT_TO_METERS_PER_SECOND;
  const trackRad = toRadians(trackDeg);
  const vx = Math.sin(trackRad) * speedMs;
  const vy = Math.cos(trackRad) * speedMs;
  const speedSquared = vx * vx + vy * vy;

  const rawSeconds = speedSquared > 0 ? -(x * vx + y * vy) / speedSquared : 0;
  const secondsUntilClosest = Math.max(0, Math.min(horizonSeconds, rawSeconds));
  const closestX = x + vx * secondsUntilClosest;
  const closestY = y + vy * secondsUntilClosest;
  const closestHorizontalMeters = Math.hypot(closestX, closestY);
  const closestHorizontalDistanceKm = closestHorizontalMeters / 1000;

  let closestSlantDistanceKm: number | null = null;
  let elevationAtClosestDeg: number | null = null;
  if (aircraft.altitude !== null && observer.altitudeMeters !== null) {
    const verticalRateMs = (aircraft.verticalRate ?? 0) * FEET_PER_MINUTE_TO_METERS_PER_SECOND;
    const aircraftAltitudeMeters = aircraft.altitude * FEET_TO_METERS + verticalRateMs * secondsUntilClosest;
    const verticalMeters = aircraftAltitudeMeters - observer.altitudeMeters;
    closestSlantDistanceKm = Math.hypot(closestHorizontalMeters, verticalMeters) / 1000;
    elevationAtClosestDeg = toDegrees(Math.atan2(verticalMeters, Math.max(closestHorizontalMeters, 0.1)));
  }

  const approaching = rawSeconds > 5 && closestHorizontalDistanceKm + 0.05 < geometry.horizontalDistanceKm;
  const phase: SpotterPassPhase = geometry.horizontalDistanceKm <= 1
    ? "overhead"
    : approaching
      ? "approaching"
      : "departing";

  return {
    secondsUntilClosest,
    currentHorizontalDistanceKm: geometry.horizontalDistanceKm,
    closestHorizontalDistanceKm,
    closestSlantDistanceKm,
    elevationAtClosestDeg,
    phase,
  };
}

