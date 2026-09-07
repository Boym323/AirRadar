import type { Coordinate } from "./types";

export type ArcDirection = "CWA" | "CCA";

export interface ArcSpec {
  start: Coordinate;
  end: Coordinate;
  center: Coordinate;
  radiusNm: number;
  direction: ArcDirection;
}

export interface DensifyArcOptions {
  /** Maximum sagitta error in kilometres on the approximated circle. */
  maxChordErrorKm?: number;
  maxSegments?: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const EARTH_RADIUS_NM = EARTH_RADIUS_KM / 1.852;

function radians(value: number): number {
  return value * Math.PI / 180;
}

function degrees(value: number): number {
  return value * 180 / Math.PI;
}

function normalizeLongitude(value: number): number {
  const normalized = ((value + 540) % 360) - 180;
  return normalized === -180 && value > 0 ? 180 : normalized;
}

/** Convert aviation DMS such as 495454.10N, 0150731.76E or 012 43 29,00 E. */
export function aviationCoordinateToDecimal(value: string): number {
  const normalized = value.trim().toUpperCase().replace(/,/g, ".");
  const match = /^(?:(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])|(\d{2,3})\s+(\d{2})\s+(\d{2}(?:\.\d+)?)\s*([NSEW]))$/.exec(normalized);
  if (!match) throw new Error(`Invalid aviation coordinate: ${value}`);
  const degreesPart = Number(match[1] ?? match[5]);
  const minutes = Number(match[2] ?? match[6]);
  const seconds = Number(match[3] ?? match[7]);
  const hemisphere = match[4] ?? match[8];
  const maximumDegrees = hemisphere === "N" || hemisphere === "S" ? 90 : 180;
  if (minutes >= 60 || seconds >= 60 || degreesPart > maximumDegrees || (degreesPart === maximumDegrees && (minutes !== 0 || seconds !== 0))) {
    throw new Error(`Aviation coordinate out of range: ${value}`);
  }
  const magnitude = degreesPart + minutes / 60 + seconds / 3600;
  return hemisphere === "S" || hemisphere === "W" ? -magnitude : magnitude;
}

function initialBearing(from: Coordinate, to: Coordinate): number {
  const fromLatitude = radians(from[1]);
  const toLatitude = radians(to[1]);
  const deltaLongitude = radians(to[0] - from[0]);
  const y = Math.sin(deltaLongitude) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(deltaLongitude);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

function destination(center: Coordinate, bearing: number, angularDistance: number): Coordinate {
  const latitude = radians(center[1]);
  const longitude = radians(center[0]);
  const bearingRadians = radians(bearing);
  const resultLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const resultLongitude = longitude + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(resultLatitude),
  );
  return [normalizeLongitude(degrees(resultLongitude)), degrees(resultLatitude)];
}

function clockwiseDelta(start: number, end: number): number {
  return (end - start + 360) % 360;
}

/**
 * Approximate an AIP CWA/CCA circle arc with deterministic spherical points.
 * The source endpoints are always retained exactly, including across 0/360°.
 */
export function densifyArc(spec: ArcSpec, options: DensifyArcOptions = {}): Coordinate[] {
  if (!Number.isFinite(spec.radiusNm) || spec.radiusNm <= 0) throw new Error("Arc radius must be a positive finite number");
  const maxChordErrorKm = options.maxChordErrorKm ?? 0.1;
  const maxSegments = options.maxSegments ?? 720;
  if (!Number.isFinite(maxChordErrorKm) || maxChordErrorKm <= 0) throw new Error("Arc chord error must be positive");
  if (!Number.isInteger(maxSegments) || maxSegments < 1) throw new Error("Arc maxSegments must be a positive integer");

  const radiusKm = spec.radiusNm * 1.852;
  const circleAngle = Math.min(Math.PI, 2 * Math.asin(Math.min(1, maxChordErrorKm / (2 * radiusKm))));
  const maxAngle = Math.max(radians(0.25), circleAngle);
  const startBearing = initialBearing(spec.center, spec.start);
  const endBearing = initialBearing(spec.center, spec.end);
  const signedSweep = spec.direction === "CWA"
    ? clockwiseDelta(startBearing, endBearing)
    : -clockwiseDelta(endBearing, startBearing);
  const segments = Math.max(1, Math.min(maxSegments, Math.ceil(Math.abs(signedSweep) / maxAngle)));
  const angularDistance = spec.radiusNm / EARTH_RADIUS_NM;
  const points: Coordinate[] = [spec.start];
  for (let index = 1; index < segments; index += 1) {
    const fraction = index / segments;
    points.push(destination(spec.center, startBearing + signedSweep * fraction, angularDistance));
  }
  points.push(spec.end);
  return points;
}
