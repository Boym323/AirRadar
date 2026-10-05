import type { TrajectoryConformanceSnapshot } from "@/lib/route-intelligence";
import type { WeatherCorridorIntelligence, WeatherCorridorEvent } from "@/lib/weather/corridor-intelligence";
import type { SigmetTrajectoryDeviation } from "@/lib/weather/sigmet-trajectory-deviation";

export const WEATHER_AVOIDANCE_VERSION = "weather-avoidance-intelligence-v1" as const;

export type WeatherAvoidanceClassification =
  | "POSSIBLE_WEATHER_AVOIDANCE"
  | "CORRELATED_DEVIATION"
  | "CURRENT_CORRIDOR_EXPOSED";

export type WeatherAvoidanceConfidence = "LOW" | "MEDIUM" | "HIGH";

export type WeatherAvoidanceEvidence =
  | "PREVIOUS_SIGMET_INTERSECTION"
  | "CURRENT_SHORT_PROJECTION_CLEAR"
  | "CURRENT_30MIN_CORRIDOR_CLEAR"
  | "CURRENT_30MIN_CORRIDOR_EXPOSED"
  | "TRAJECTORY_DEVIATING"
  | "TRAJECTORY_REJOINING"
  | "TRAJECTORY_PROBABLE_DIRECT"
  | "TRAJECTORY_OFFSET"
  | "ROUTE_AWARE_CORRIDOR"
  | "KINEMATIC_CORRIDOR"
  | "SIGMET_SOURCE_STALE"
  | "SIGMET_SOURCE_UNAVAILABLE"
  | "WEATHER_CORRIDOR_PARTIAL";

export interface WeatherAvoidanceExposure {
  intersects: boolean | null;
  entryMinutes: number | null;
  distanceNm: number | null;
}

export interface WeatherAvoidanceIntelligence {
  version: typeof WEATHER_AVOIDANCE_VERSION;
  classification: WeatherAvoidanceClassification;
  confidence: WeatherAvoidanceConfidence;
  sigmetId: string;
  hazard: string | null;
  phenomenon: string | null;
  headingChangeDeg: number;
  previousTrackDeg: number;
  currentTrackDeg: number;
  lookbackMinutes: number;
  previousExposure: WeatherAvoidanceExposure;
  currentExposure: WeatherAvoidanceExposure;
  conformanceStatus: TrajectoryConformanceSnapshot["status"] | null;
  evidence: WeatherAvoidanceEvidence[];
}

export interface WeatherAvoidanceInput {
  deviation: SigmetTrajectoryDeviation | null;
  conformance: TrajectoryConformanceSnapshot | null;
  weatherCorridor: WeatherCorridorIntelligence | null;
}

function sigmetSourceState(
  corridor: WeatherCorridorIntelligence | null,
): "AVAILABLE" | "STALE" | "UNAVAILABLE" {
  return corridor?.sources.find((source) => source.source === "SIGMET")?.state ?? "UNAVAILABLE";
}

function matchingEntry(
  corridor: WeatherCorridorIntelligence | null,
  sigmetId: string,
): WeatherCorridorEvent | null {
  if (!corridor) return null;
  return corridor.events
    .filter((event) => event.source === "SIGMET"
      && event.type === "SIGMET_ENTRY"
      && event.sourceReference === sigmetId)
    .sort((left, right) => left.offsetMinutes - right.offsetMinutes)[0] ?? null;
}

function conformanceEvidence(
  conformance: TrajectoryConformanceSnapshot | null,
): WeatherAvoidanceEvidence | null {
  if (!conformance) return null;
  if (conformance.status === "DEVIATING") return "TRAJECTORY_DEVIATING";
  if (conformance.status === "REJOINING") return "TRAJECTORY_REJOINING";
  if (conformance.status === "PROBABLE_DIRECT") return "TRAJECTORY_PROBABLE_DIRECT";
  if (conformance.status === "OFFSET") return "TRAJECTORY_OFFSET";
  return null;
}

function confidenceRank(value: WeatherAvoidanceConfidence): number {
  return value === "HIGH" ? 3 : value === "MEDIUM" ? 2 : 1;
}

function lowerConfidence(
  value: WeatherAvoidanceConfidence,
  maximum: WeatherAvoidanceConfidence,
): WeatherAvoidanceConfidence {
  return confidenceRank(value) <= confidenceRank(maximum) ? value : maximum;
}

export function buildWeatherAvoidanceIntelligence(
  input: WeatherAvoidanceInput,
): WeatherAvoidanceIntelligence | null {
  const deviation = input.deviation;
  if (!deviation) return null;

  const evidence: WeatherAvoidanceEvidence[] = [
    "PREVIOUS_SIGMET_INTERSECTION",
    "CURRENT_SHORT_PROJECTION_CLEAR",
  ];

  const sourceState = sigmetSourceState(input.weatherCorridor);
  const currentEntry = matchingEntry(input.weatherCorridor, deviation.sigmetId);
  const conformance = conformanceEvidence(input.conformance);
  if (conformance) evidence.push(conformance);

  if (input.weatherCorridor?.corridorMode === "ROUTE_AWARE") evidence.push("ROUTE_AWARE_CORRIDOR");
  if (input.weatherCorridor?.corridorMode === "KINEMATIC") evidence.push("KINEMATIC_CORRIDOR");
  if (input.weatherCorridor && input.weatherCorridor.status !== "AVAILABLE") evidence.push("WEATHER_CORRIDOR_PARTIAL");

  if (sourceState === "STALE") evidence.push("SIGMET_SOURCE_STALE");
  if (sourceState === "UNAVAILABLE") evidence.push("SIGMET_SOURCE_UNAVAILABLE");

  let classification: WeatherAvoidanceClassification = "CORRELATED_DEVIATION";
  let confidence: WeatherAvoidanceConfidence = deviation.confidence === "medium" ? "MEDIUM" : "LOW";

  if (currentEntry) {
    classification = "CURRENT_CORRIDOR_EXPOSED";
    evidence.push("CURRENT_30MIN_CORRIDOR_EXPOSED");
    confidence = lowerConfidence(confidence, "MEDIUM");
  } else if (input.weatherCorridor && sourceState !== "UNAVAILABLE") {
    evidence.push("CURRENT_30MIN_CORRIDOR_CLEAR");
    const conformanceSupportsDeviation = input.conformance !== null
      && ["DEVIATING", "REJOINING", "PROBABLE_DIRECT", "OFFSET"].includes(input.conformance.status);

    if (conformanceSupportsDeviation) {
      classification = "POSSIBLE_WEATHER_AVOIDANCE";
      confidence = deviation.confidence === "medium"
        && sourceState === "AVAILABLE"
        && input.weatherCorridor.status === "AVAILABLE"
        && input.weatherCorridor.corridorMode === "ROUTE_AWARE"
        && input.conformance?.confidence !== "LOW"
        ? "HIGH"
        : "MEDIUM";
    } else {
      confidence = deviation.confidence === "medium" ? "MEDIUM" : "LOW";
    }
  }

  if (sourceState === "STALE") confidence = lowerConfidence(confidence, "MEDIUM");
  if (sourceState === "UNAVAILABLE") confidence = lowerConfidence(confidence, "LOW");
  if (input.weatherCorridor?.corridorMode === "KINEMATIC") confidence = lowerConfidence(confidence, "MEDIUM");
  if (input.conformance?.confidence === "LOW") confidence = lowerConfidence(confidence, "MEDIUM");

  return {
    version: WEATHER_AVOIDANCE_VERSION,
    classification,
    confidence,
    sigmetId: deviation.sigmetId,
    hazard: deviation.hazard,
    phenomenon: deviation.phenomenon,
    headingChangeDeg: deviation.headingChangeDeg,
    previousTrackDeg: deviation.previousTrackDeg,
    currentTrackDeg: deviation.currentTrackDeg,
    lookbackMinutes: deviation.lookbackMinutes,
    previousExposure: {
      intersects: true,
      entryMinutes: deviation.previousProjectedEntryMinutes,
      distanceNm: deviation.previousProjectedEntryDistanceNm,
    },
    currentExposure: {
      intersects: input.weatherCorridor === null || sourceState === "UNAVAILABLE"
        ? null
        : currentEntry !== null,
      entryMinutes: currentEntry?.offsetMinutes ?? null,
      distanceNm: currentEntry?.distanceAlongCorridorNm ?? null,
    },
    conformanceStatus: input.conformance?.status ?? null,
    evidence: [...new Set(evidence)],
  };
}
