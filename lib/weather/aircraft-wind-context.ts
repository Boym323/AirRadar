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

  let nearest: AircraftWindSnapshot["points"][number] | null = null;
  let nearestDistanceKm = Number.POSITIVE_INFINITY;
  for (const point of wind.points) {
    if (point.speedKt === null || point.directionDeg === null) continue;
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !Number.isFinite(point.speedKt) || !Number.isFinite(point.directionDeg)) continue;
    const distanceKm = haversineKm(aircraft.lat, aircraft.lon, point.lat, point.lon);
    if (distanceKm < nearestDistanceKm) {
      nearest = point;
      nearestDistanceKm = distanceKm;
    }
  }

  if (!nearest || nearestDistanceKm > MAX_WIND_POINT_DISTANCE_KM) return null;

  const windFromDeg = normalizeDegrees(nearest.directionDeg!);
  const trackDeg = normalizeDegrees(aircraft.track);
  const relativeRad = (windFromDeg - trackDeg) * Math.PI / 180;
  const longitudinalKt = nearest.speedKt! * Math.cos(relativeRad);
  const signedCrosswindKt = nearest.speedKt! * Math.sin(relativeRad);
  const crosswindKt = Math.abs(signedCrosswindKt);

  return {
    levelHpa: wind.levelHpa,
    representativeAltitudeFt: LEVEL_ALTITUDES_FT[wind.levelHpa],
    model: wind.model,
    validAt: wind.validAt,
    stale: wind.stale,
    sourceDistanceKm: nearestDistanceKm,
    windSpeedKt: nearest.speedKt!,
    windFromDeg,
    headwindKt: Math.max(0, longitudinalKt),
    tailwindKt: Math.max(0, -longitudinalKt),
    crosswindKt,
    crosswindFrom: crosswindKt < 1 ? null : signedCrosswindKt > 0 ? "right" : "left",
  };
}
