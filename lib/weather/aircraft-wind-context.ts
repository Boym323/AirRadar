import type { AircraftView } from "@/lib/aircraft/types";
import type { WindLevelHpa } from "@/lib/server/wind-aloft";

const LEVEL_ALTITUDES_FT: Record<WindLevelHpa, number> = {
  850: 4_800,
  700: 9_900,
  500: 18_300,
  300: 30_100,
  200: 38_700,
};

const MAX_WIND_POINT_DISTANCE_KM = 120;

export interface AircraftWindSnapshot {
  model: string;
  validAt: string;
  levelHpa: WindLevelHpa;
  stale: boolean;
  points: Array<{ lat: number; lon: number; speedKt: number | null; directionDeg: number | null }>;
}

export interface AircraftWindContext {
  levelHpa: WindLevelHpa;
  representativeAltitudeFt: number;
  model: string;
  validAt: string;
  stale: boolean;
  sourceDistanceKm: number;
  windSpeedKt: number;
  windFromDeg: number;
  headwindKt: number;
  tailwindKt: number;
  crosswindKt: number;
  crosswindFrom: "left" | "right" | null;
}

export interface AircraftWindAheadPoint {
  distanceNm: number;
  sourceDistanceKm: number;
  windSpeedKt: number;
  windFromDeg: number;
  headwindKt: number;
  tailwindKt: number;
  crosswindKt: number;
  crosswindFrom: "left" | "right" | null;
  signedAlongTrackKt: number;
}

export interface AircraftWindAheadProfile {
  points: AircraftWindAheadPoint[];
  trend: "more_headwind" | "more_tailwind" | "stable" | "variable";
  deltaAlongTrackKt: number;
  furthestDistanceNm: number;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function projectPosition(lat: number, lon: number, trackDeg: number, distanceNm: number): { lat: number; lon: number } {
  const angularDistance = distanceNm / 3440.065;
  const bearing = normalizeDegrees(trackDeg) * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return {
    lat: lat2 * 180 / Math.PI,
    lon: ((lon2 * 180 / Math.PI + 540) % 360) - 180,
  };
}

function windAtPoint(
  lat: number,
  lon: number,
  trackDeg: number,
  wind: AircraftWindSnapshot,
): Omit<AircraftWindAheadPoint, "distanceNm"> | null {
  let nearest: AircraftWindSnapshot["points"][number] | null = null;
  let nearestDistanceKm = Number.POSITIVE_INFINITY;
  for (const point of wind.points) {
    if (point.speedKt === null || point.directionDeg === null) continue;
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !Number.isFinite(point.speedKt) || !Number.isFinite(point.directionDeg)) continue;
    const distanceKm = haversineKm(lat, lon, point.lat, point.lon);
    if (distanceKm < nearestDistanceKm) {
      nearest = point;
      nearestDistanceKm = distanceKm;
    }
  }

  if (!nearest || nearestDistanceKm > MAX_WIND_POINT_DISTANCE_KM) return null;

  const windFromDeg = normalizeDegrees(nearest.directionDeg!);
  const relativeRad = (windFromDeg - normalizeDegrees(trackDeg)) * Math.PI / 180;
  const signedAlongTrackKt = nearest.speedKt! * Math.cos(relativeRad);
  const signedCrosswindKt = nearest.speedKt! * Math.sin(relativeRad);
  const crosswindKt = Math.abs(signedCrosswindKt);

  return {
    sourceDistanceKm: nearestDistanceKm,
    windSpeedKt: nearest.speedKt!,
    windFromDeg,
    headwindKt: Math.max(0, signedAlongTrackKt),
    tailwindKt: Math.max(0, -signedAlongTrackKt),
    crosswindKt,
    crosswindFrom: crosswindKt < 1 ? null : signedCrosswindKt > 0 ? "right" : "left",
    signedAlongTrackKt,
  };
}

export function windLevelForAltitude(altitudeFt: number | null | undefined): WindLevelHpa | null {
  if (altitudeFt === null || altitudeFt === undefined || !Number.isFinite(altitudeFt)) return null;
  return (Object.entries(LEVEL_ALTITUDES_FT) as Array<[string, number]>)
    .map(([level, representativeAltitudeFt]) => ({
      level: Number(level) as WindLevelHpa,
      distance: Math.abs(altitudeFt - representativeAltitudeFt),
    }))
    .sort((left, right) => left.distance - right.distance || left.level - right.level)[0]?.level ?? null;
}

export function buildAircraftWindContext(
  aircraft: AircraftView | null,
  wind: AircraftWindSnapshot | null,
): AircraftWindContext | null {
  if (!aircraft || aircraft.onGround || !wind || aircraft.lat === null || aircraft.lon === null || aircraft.track === null) return null;
  const point = windAtPoint(aircraft.lat, aircraft.lon, aircraft.track, wind);
  if (!point) return null;

  return {
    levelHpa: wind.levelHpa,
    representativeAltitudeFt: LEVEL_ALTITUDES_FT[wind.levelHpa],
    model: wind.model,
    validAt: wind.validAt,
    stale: wind.stale,
    sourceDistanceKm: point.sourceDistanceKm,
    windSpeedKt: point.windSpeedKt,
    windFromDeg: point.windFromDeg,
    headwindKt: point.headwindKt,
    tailwindKt: point.tailwindKt,
    crosswindKt: point.crosswindKt,
    crosswindFrom: point.crosswindFrom,
  };
}

export function buildAircraftWindAheadProfile(
  aircraft: AircraftView | null,
  wind: AircraftWindSnapshot | null,
  distancesNm: readonly number[] = [25, 50, 100],
): AircraftWindAheadProfile | null {
  if (!aircraft || aircraft.onGround || !wind || aircraft.lat === null || aircraft.lon === null || aircraft.track === null) return null;
  const current = windAtPoint(aircraft.lat, aircraft.lon, aircraft.track, wind);
  if (!current) return null;

  const points = distancesNm
    .filter((distanceNm) => Number.isFinite(distanceNm) && distanceNm > 0)
    .map((distanceNm) => {
      const projected = projectPosition(aircraft.lat!, aircraft.lon!, aircraft.track!, distanceNm);
      const sample = windAtPoint(projected.lat, projected.lon, aircraft.track!, wind);
      return sample ? { distanceNm, ...sample } : null;
    })
    .filter((point): point is AircraftWindAheadPoint => point !== null);

  if (!points.length) return null;

  const furthest = points[points.length - 1]!;
  const deltaAlongTrackKt = furthest.signedAlongTrackKt - current.signedAlongTrackKt;
  const signs = points.map((point) => Math.sign(point.signedAlongTrackKt - current.signedAlongTrackKt));
  const significantSigns = signs.filter((sign, index) => {
    const point = points[index]!;
    return Math.abs(point.signedAlongTrackKt - current.signedAlongTrackKt) >= 5;
  });
  let trend: AircraftWindAheadProfile["trend"] = "stable";
  if (significantSigns.length > 0) {
    const hasPositive = significantSigns.some((sign) => sign > 0);
    const hasNegative = significantSigns.some((sign) => sign < 0);
    trend = hasPositive && hasNegative
      ? "variable"
      : hasPositive
        ? "more_headwind"
        : "more_tailwind";
  }

  return {
    points,
    trend,
    deltaAlongTrackKt,
    furthestDistanceNm: furthest.distanceNm,
  };
}
