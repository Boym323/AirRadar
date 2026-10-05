import { haversineDistanceKm } from "@/lib/geo";
import type { OperationalTwinCorridor } from "./types";
import type {
  WeatherCorridorIntelligence,
  WeatherCorridorWindSample,
} from "@/lib/weather/corridor-intelligence";

export const OPERATIONAL_TWIN_WIND_TIMING_SHADOW_VERSION =
  "operational-digital-twin-wind-timing-shadow-v1" as const;
export const OPERATIONAL_TWIN_WIND_TIMING_CHECKPOINTS_MINUTES = [5, 15, 30] as const;

const KM_PER_NM = 1.852;
const MIN_SPEED_KT = 30;
const MAX_SPEED_KT = 750;
const MIN_WIND_SAMPLES = 2;

export type OperationalTwinWindTimingShadowStatus =
  | "AVAILABLE"
  | "STALE"
  | "INSUFFICIENT";

export type OperationalTwinWindTimingShadowReason =
  | "wind_unavailable"
  | "wind_samples_insufficient"
  | "current_wind_missing"
  | "ground_speed_invalid"
  | "still_air_speed_invalid"
  | "corridor_geometry_insufficient";

export interface OperationalTwinWindTimingCheckpoint {
  horizonMinutes: number;
  distanceNm: number;
  canonicalOffsetMinutes: number;
  shadowOffsetMinutes: number;
  deltaSeconds: number;
}

export interface OperationalTwinWindTimingWaypoint {
  id: string;
  name: string;
  distanceNm: number;
  canonicalOffsetMinutes: number;
  shadowOffsetMinutes: number;
  deltaSeconds: number;
  sourceKind: string;
}

export interface OperationalTwinWindTimingShadow {
  version: typeof OPERATIONAL_TWIN_WIND_TIMING_SHADOW_VERSION;
  mode: "SHADOW";
  status: OperationalTwinWindTimingShadowStatus;
  reasons: OperationalTwinWindTimingShadowReason[];
  windModel: "ICON-EU" | null;
  windStatus: WeatherCorridorIntelligence["wind"]["status"];
  corridorMode: OperationalTwinCorridor["mode"];
  observedGroundSpeedKt: number | null;
  inferredStillAirSpeedKt: number | null;
  windSamples: number;
  uniqueWindSamples: number;
  speedClampSegments: number;
  checkpoints: OperationalTwinWindTimingCheckpoint[];
  waypoints: OperationalTwinWindTimingWaypoint[];
  maxAbsoluteDeltaSeconds: number | null;
  meanAbsoluteDeltaSeconds: number | null;
}

interface DistanceTimePoint {
  distanceNm: number;
  canonicalMinutes: number;
  shadowMinutes: number;
}

interface WindPoint {
  distanceNm: number;
  alongTrackKt: number;
}

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function distanceNm(
  left: { lat: number; lon: number },
  right: { lat: number; lon: number },
): number {
  return haversineDistanceKm(left.lat, left.lon, right.lat, right.lon) / KM_PER_NM;
}

function cumulativeDistances(corridor: OperationalTwinCorridor): number[] {
  const values = [0];
  let total = 0;
  for (let index = 1; index < corridor.points.length; index += 1) {
    total += distanceNm(corridor.points[index - 1]!, corridor.points[index]!);
    values.push(total);
  }
  return values;
}

function deduplicatedWindPoints(samples: readonly WeatherCorridorWindSample[]): WindPoint[] {
  const sorted = samples
    .filter((sample) =>
      Number.isFinite(sample.distanceAlongCorridorNm)
      && Number.isFinite(sample.headwindKt)
      && Number.isFinite(sample.tailwindKt))
    .map((sample) => ({
      distanceNm: Math.max(0, sample.distanceAlongCorridorNm),
      alongTrackKt: sample.tailwindKt - sample.headwindKt,
    }))
    .sort((left, right) => left.distanceNm - right.distanceNm);

  const result: WindPoint[] = [];
  for (const sample of sorted) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.distanceNm - sample.distanceNm) < 0.05) {
      previous.alongTrackKt = (previous.alongTrackKt + sample.alongTrackKt) / 2;
      continue;
    }
    result.push({ ...sample });
  }
  return result;
}

function interpolateSeries(
  points: readonly { x: number; y: number }[],
  x: number,
): number | null {
  if (!points.length) return null;
  if (x <= points[0]!.x) return points[0]!.y;
  if (x >= points.at(-1)!.x) return points.at(-1)!.y;
  const upperIndex = points.findIndex((point) => point.x >= x);
  if (upperIndex <= 0) return points[0]!.y;
  const lower = points[upperIndex - 1]!;
  const upper = points[upperIndex]!;
  const span = upper.x - lower.x;
  if (span <= 0) return lower.y;
  const ratio = (x - lower.x) / span;
  return lower.y + (upper.y - lower.y) * ratio;
}

function windAtDistance(points: readonly WindPoint[], distance: number): number | null {
  return interpolateSeries(
    points.map((point) => ({ x: point.distanceNm, y: point.alongTrackKt })),
    distance,
  );
}

function distanceAtCanonicalOffset(
  corridor: OperationalTwinCorridor,
  distances: readonly number[],
  offsetMinutes: number,
): number | null {
  const points = corridor.points.map((point, index) => ({
    x: point.offsetMinutes,
    y: distances[index] ?? 0,
  }));
  return interpolateSeries(points, offsetMinutes);
}

function shadowTimeAtDistance(
  timeline: readonly DistanceTimePoint[],
  distance: number,
): number | null {
  return interpolateSeries(
    timeline.map((point) => ({ x: point.distanceNm, y: point.shadowMinutes })),
    distance,
  );
}

function emptyShadow(
  corridor: OperationalTwinCorridor,
  weather: WeatherCorridorIntelligence,
  observedGroundSpeedKt: number | null,
  reasons: OperationalTwinWindTimingShadowReason[],
): OperationalTwinWindTimingShadow {
  return {
    version: OPERATIONAL_TWIN_WIND_TIMING_SHADOW_VERSION,
    mode: "SHADOW",
    status: "INSUFFICIENT",
    reasons,
    windModel: weather.wind.model,
    windStatus: weather.wind.status,
    corridorMode: corridor.mode,
    observedGroundSpeedKt,
    inferredStillAirSpeedKt: null,
    windSamples: weather.wind.samples.length,
    uniqueWindSamples: deduplicatedWindPoints(weather.wind.samples).length,
    speedClampSegments: 0,
    checkpoints: [],
    waypoints: [],
    maxAbsoluteDeltaSeconds: null,
    meanAbsoluteDeltaSeconds: null,
  };
}

export function buildOperationalTwinWindTimingShadow(input: {
  corridor: OperationalTwinCorridor;
  weatherCorridor: WeatherCorridorIntelligence;
  observedGroundSpeedKt: number | null;
}): OperationalTwinWindTimingShadow {
  const { corridor, weatherCorridor, observedGroundSpeedKt } = input;
  if (corridor.points.length < 2) {
    return emptyShadow(corridor, weatherCorridor, observedGroundSpeedKt, ["corridor_geometry_insufficient"]);
  }
  if (!finite(observedGroundSpeedKt) || observedGroundSpeedKt < MIN_SPEED_KT) {
    return emptyShadow(corridor, weatherCorridor, observedGroundSpeedKt, ["ground_speed_invalid"]);
  }
  if (weatherCorridor.wind.status === "UNAVAILABLE") {
    return emptyShadow(corridor, weatherCorridor, observedGroundSpeedKt, ["wind_unavailable"]);
  }

  const windPoints = deduplicatedWindPoints(weatherCorridor.wind.samples);
  if (windPoints.length < MIN_WIND_SAMPLES) {
    return emptyShadow(corridor, weatherCorridor, observedGroundSpeedKt, ["wind_samples_insufficient"]);
  }

  const currentWind = windAtDistance(windPoints, 0);
  if (currentWind === null || windPoints[0]!.distanceNm > 2) {
    return emptyShadow(corridor, weatherCorridor, observedGroundSpeedKt, ["current_wind_missing"]);
  }

  // GS ~= still-air speed + along-track wind. Infer only a bounded proxy from
  // the observed ground speed; do not treat it as TAS or mutate canonical state.
  const inferredStillAirSpeedKt = observedGroundSpeedKt - currentWind;
  if (
    !Number.isFinite(inferredStillAirSpeedKt)
    || inferredStillAirSpeedKt < MIN_SPEED_KT
    || inferredStillAirSpeedKt > MAX_SPEED_KT
  ) {
    return emptyShadow(corridor, weatherCorridor, observedGroundSpeedKt, ["still_air_speed_invalid"]);
  }

  const distances = cumulativeDistances(corridor);
  const timeline: DistanceTimePoint[] = [{
    distanceNm: 0,
    canonicalMinutes: corridor.points[0]!.offsetMinutes,
    shadowMinutes: 0,
  }];
  let shadowMinutes = 0;
  let speedClampSegments = 0;

  for (let index = 1; index < corridor.points.length; index += 1) {
    const startDistance = distances[index - 1] ?? 0;
    const endDistance = distances[index] ?? startDistance;
    const segmentDistance = Math.max(0, endDistance - startDistance);
    const midpointDistance = startDistance + segmentDistance / 2;
    const alongTrackWind = windAtDistance(windPoints, midpointDistance) ?? currentWind;
    const rawGroundSpeed = inferredStillAirSpeedKt + alongTrackWind;
    const adjustedGroundSpeed = Math.min(MAX_SPEED_KT, Math.max(MIN_SPEED_KT, rawGroundSpeed));
    if (adjustedGroundSpeed !== rawGroundSpeed) speedClampSegments += 1;
    shadowMinutes += segmentDistance / adjustedGroundSpeed * 60;
    timeline.push({
      distanceNm: endDistance,
      canonicalMinutes: corridor.points[index]!.offsetMinutes,
      shadowMinutes,
    });
  }

  const checkpoints = OPERATIONAL_TWIN_WIND_TIMING_CHECKPOINTS_MINUTES.flatMap((horizonMinutes) => {
    if (horizonMinutes > corridor.horizonMinutes) return [];
    const distance = distanceAtCanonicalOffset(corridor, distances, horizonMinutes);
    if (distance === null) return [];
    const adjusted = shadowTimeAtDistance(timeline, distance);
    if (adjusted === null) return [];
    return [{
      horizonMinutes,
      distanceNm: Number(distance.toFixed(2)),
      canonicalOffsetMinutes: horizonMinutes,
      shadowOffsetMinutes: Number(adjusted.toFixed(3)),
      deltaSeconds: Math.round((adjusted - horizonMinutes) * 60),
    }];
  });

  const waypoints = corridor.waypoints.flatMap((waypoint) => {
    const adjusted = shadowTimeAtDistance(timeline, waypoint.distanceNm);
    if (adjusted === null) return [];
    return [{
      id: waypoint.id,
      name: waypoint.name,
      distanceNm: waypoint.distanceNm,
      canonicalOffsetMinutes: waypoint.offsetMinutes,
      shadowOffsetMinutes: Number(adjusted.toFixed(3)),
      deltaSeconds: Math.round((adjusted - waypoint.offsetMinutes) * 60),
      sourceKind: waypoint.sourceKind,
    }];
  });

  const deltas = [...checkpoints, ...waypoints].map((item) => Math.abs(item.deltaSeconds));
  return {
    version: OPERATIONAL_TWIN_WIND_TIMING_SHADOW_VERSION,
    mode: "SHADOW",
    status: weatherCorridor.wind.status === "STALE" ? "STALE" : "AVAILABLE",
    reasons: [],
    windModel: weatherCorridor.wind.model,
    windStatus: weatherCorridor.wind.status,
    corridorMode: corridor.mode,
    observedGroundSpeedKt: Number(observedGroundSpeedKt.toFixed(1)),
    inferredStillAirSpeedKt: Number(inferredStillAirSpeedKt.toFixed(1)),
    windSamples: weatherCorridor.wind.samples.length,
    uniqueWindSamples: windPoints.length,
    speedClampSegments,
    checkpoints,
    waypoints,
    maxAbsoluteDeltaSeconds: deltas.length ? Math.max(...deltas) : null,
    meanAbsoluteDeltaSeconds: deltas.length
      ? Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length)
      : null,
  };
}
