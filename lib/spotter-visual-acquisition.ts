import type { AircraftView } from "@/lib/aircraft/types";
import type { MetarMapObservation } from "@/lib/weather/types";
import { haversineDistanceKm, observerGeometry, type SpotterObserverPosition } from "@/lib/spotter-location";

export type SpotterVisualStatus = "GOOD" | "POSSIBLE" | "POOR" | "UNKNOWN";
export type SpotterVisualReasonCode =
  | "HIGH_ELEVATION"
  | "LOW_ELEVATION"
  | "GOOD_VISIBILITY"
  | "FAIR_VISIBILITY"
  | "POOR_VISIBILITY"
  | "CLEAR_OF_CEILING"
  | "ABOVE_CEILING"
  | "WEATHER_DISTANT"
  | "WEATHER_UNAVAILABLE";

export interface SpotterVisualAcquisition {
  status: SpotterVisualStatus;
  score: number;
  elevationDeg: number | null;
  slantDistanceKm: number | null;
  horizontalDistanceKm: number | null;
  visibilityMeters: number | null;
  ceilingFtAgl: number | null;
  weatherStationId: string | null;
  weatherStationDistanceKm: number | null;
  aircraftAboveCeiling: boolean | null;
  reasons: SpotterVisualReasonCode[];
}

export interface NearestMetar {
  observation: MetarMapObservation;
  distanceKm: number;
}

export function nearestMetarObservation(
  observations: readonly MetarMapObservation[],
  observer: Pick<SpotterObserverPosition, "lat" | "lon">,
  maxDistanceKm = 100,
): NearestMetar | null {
  let best: NearestMetar | null = null;
  for (const observation of observations) {
    if (!Number.isFinite(observation.lat) || !Number.isFinite(observation.lon)) continue;
    const distanceKm = haversineDistanceKm(observer, { lat: observation.lat, lon: observation.lon });
    if (distanceKm > maxDistanceKm) continue;
    if (!best || distanceKm < best.distanceKm) {
      best = { observation, distanceKm };
    }
  }
  return best;
}

export function evaluateVisualAcquisition(
  aircraft: Pick<AircraftView, "lat" | "lon" | "altitude">,
  observer: SpotterObserverPosition,
  weather: NearestMetar | null,
): SpotterVisualAcquisition {
  const geometry = observerGeometry(aircraft, observer);
  const reasons: SpotterVisualReasonCode[] = [];
  let score = 50;

  const elevationDeg = geometry?.elevationDeg ?? null;
  if (elevationDeg !== null) {
    if (elevationDeg >= 30) {
      score += 20;
      reasons.push("HIGH_ELEVATION");
    } else if (elevationDeg < 8) {
      score -= 20;
      reasons.push("LOW_ELEVATION");
    }
  }

  const visibilityMeters = weather?.observation.visibility ?? null;
  if (visibilityMeters !== null) {
    if (visibilityMeters >= 10_000) {
      score += 15;
      reasons.push("GOOD_VISIBILITY");
    } else if (visibilityMeters >= 5_000) {
      score += 5;
      reasons.push("FAIR_VISIBILITY");
    } else {
      score -= 25;
      reasons.push("POOR_VISIBILITY");
    }
  } else {
    reasons.push("WEATHER_UNAVAILABLE");
  }

  const ceilingFtAgl = weather?.observation.ceiling ?? null;
  let aircraftAboveCeiling: boolean | null = null;
  if (ceilingFtAgl !== null && aircraft.altitude !== null && observer.altitudeMeters !== null) {
    const observerAltitudeFt = observer.altitudeMeters / 0.3048;
    const estimatedCeilingMslFt = observerAltitudeFt + ceilingFtAgl;
    aircraftAboveCeiling = aircraft.altitude > estimatedCeilingMslFt + 500;
    if (aircraftAboveCeiling) {
      score -= 20;
      reasons.push("ABOVE_CEILING");
    } else {
      score += 10;
      reasons.push("CLEAR_OF_CEILING");
    }
  }

  if (weather && weather.distanceKm > 60) {
    score -= 10;
    reasons.push("WEATHER_DISTANT");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status: SpotterVisualStatus = geometry === null
    ? "UNKNOWN"
    : score >= 70
      ? "GOOD"
      : score >= 40
        ? "POSSIBLE"
        : "POOR";

  return {
    status,
    score,
    elevationDeg,
    slantDistanceKm: geometry?.slantDistanceKm ?? null,
    horizontalDistanceKm: geometry?.horizontalDistanceKm ?? null,
    visibilityMeters,
    ceilingFtAgl,
    weatherStationId: weather?.observation.stationId ?? null,
    weatherStationDistanceKm: weather?.distanceKm ?? null,
    aircraftAboveCeiling,
    reasons,
  };
}
