import type { Aircraft } from "@/lib/aircraft/types";
import { haversineDistanceKm } from "@/lib/geo";
import type { FlightObservation } from "@/lib/intelligence/types";

const WINDOW_MS = 5 * 60_000;
const MAX_POSITION_AGE_MS = 60_000;

export interface GoAroundAirport {
  icao: string;
  latitude: number;
  longitude: number;
}

export interface GoAroundDetection {
  type: "GO_AROUND_DETECTED";
  confidence: number;
  airport?: string;
  reasonCodes: string[];
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Detects a go-around from a bounded approach episode. A single climb is not
 * enough: the episode must contain a fresh, low-altitude descent toward the
 * airport followed by a sustained climb while remaining airborne and moving
 * away from the closest approach point.
 */
export function detectGoAround(
  observations: readonly FlightObservation[],
  airport?: GoAroundAirport,
): GoAroundDetection | null {
  const latest = observations.at(-1);
  if (!latest || latest.aircraft.onGround || latest.aircraft.lat === null || latest.aircraft.lon === null) return null;
  if (finite(latest.aircraft.seenPosSeconds) && latest.aircraft.seenPosSeconds * 1000 > MAX_POSITION_AGE_MS) return null;

  const recent = observations.filter((item) => latest.observedAt - item.observedAt >= 0 && latest.observedAt - item.observedAt <= WINDOW_MS);
  if (recent.length < 3) return null;
  const previous = recent.slice(0, -1);
  const distance = (item: Aircraft): number | null => airport && item.lat !== null && item.lon !== null
    ? haversineDistanceKm(item.lat, item.lon, airport.latitude, airport.longitude)
    : null;
  const latestDistance = distance(latest.aircraft);
  if (latestDistance === null || latestDistance > 8) return null;

  const approach = previous.filter((item, index) => {
    const currentDistance = distance(item.aircraft);
    const nextDistance = distance(previous[index + 1]?.aircraft ?? latest.aircraft);
    return currentDistance !== null
      && nextDistance !== null
      && currentDistance <= 25
      && (item.aircraft.altitude ?? Number.POSITIVE_INFINITY) <= 7_000
      && (item.aircraft.verticalRate ?? 0) <= -150
      && nextDistance < currentDistance;
  });
  if (!approach.length) return null;

  const minimumDistance = Math.min(...recent.map((item) => distance(item.aircraft)).filter((value): value is number => value !== null));
  const altitudeBeforeClimb = previous.at(-1)?.aircraft.altitude ?? null;
  const currentAltitude = latest.aircraft.altitude ?? null;
  const climbed = (latest.aircraft.verticalRate ?? 0) >= 500
    && currentAltitude !== null
    && altitudeBeforeClimb !== null
    && currentAltitude >= altitudeBeforeClimb + 100;
  const movedAway = latestDistance >= minimumDistance + 0.5;
  const airborne = latest.aircraft.onGround === false;
  if (!climbed || !movedAway || !airborne) return null;

  const reasonCodes = [
    "approach_established",
    "low_altitude_descent",
    "sustained_positive_vertical_rate",
    "airborne",
    "moved_away_after_closest_approach",
  ];
  return {
    type: "GO_AROUND_DETECTED",
    confidence: Number((0.6 + (latestDistance <= 5 ? 0.1 : 0) + (approach.length >= 2 ? 0.1 : 0) + (movedAway ? 0.1 : 0)).toFixed(2)),
    ...(airport ? { airport: airport.icao } : {}),
    reasonCodes,
  };
}
