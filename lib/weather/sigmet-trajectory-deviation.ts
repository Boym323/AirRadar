import type { AircraftView, TrailPoint } from "@/lib/aircraft/types";
import { pointInSigmetGeometry, projectPosition } from "@/lib/weather/aircraft-sigmet-context";
import type { AviationSigmet, SigmetSnapshot } from "@/lib/weather/types";

export interface SigmetTrajectoryDeviation {
  sigmetId: string;
  hazard: string | null;
  phenomenon: string | null;
  firName: string | null;
  previousTrackDeg: number;
  currentTrackDeg: number;
  headingChangeDeg: number;
  lookbackMinutes: number;
  previousProjectedEntryMinutes: number;
  previousProjectedEntryDistanceNm: number;
  confidence: "low" | "medium";
}

const MIN_TURN_DEG = 15;
const MIN_SPEED_KT = 100;
const MIN_LOOKBACK_MINUTES = 2;
const MAX_LOOKBACK_MINUTES = 10;
const IDEAL_LOOKBACK_MINUTES = 5;
const PROJECTION_MINUTES = 15;

function headingDelta(left: number, right: number): number {
  return Math.abs(((right - left + 540) % 360) - 180);
}

function altitudeMatches(altitudeFt: number | null, sigmet: Omit<AviationSigmet, "geometry">): boolean {
  if (altitudeFt === null) return true;
  if (sigmet.lowerFt !== null && altitudeFt < sigmet.lowerFt) return false;
  if (sigmet.upperFt !== null && altitudeFt > sigmet.upperFt) return false;
  return true;
}

function projectedEntry(
  lat: number,
  lon: number,
  trackDeg: number,
  speedKt: number,
  altitudeFt: number | null,
  verticalRateFpm: number | null,
  feature: SigmetSnapshot["features"][number],
): { minutes: number; distanceNm: number } | null {
  for (let minute = 1; minute <= PROJECTION_MINUTES; minute += 1) {
    const distanceNm = speedKt * minute / 60;
    const projected = projectPosition(lat, lon, trackDeg, distanceNm);
    const projectedAltitudeFt = altitudeFt === null ? null : altitudeFt + (verticalRateFpm ?? 0) * minute;
    if (!altitudeMatches(projectedAltitudeFt, feature.properties)) continue;
    if (pointInSigmetGeometry(projected.lon, projected.lat, feature.geometry)) return { minutes: minute, distanceNm };
  }
  return null;
}

function selectLookbackPoint(points: readonly TrailPoint[], nowMs: number): TrailPoint | null {
  const candidates = points.filter((point) => {
    if (point.track === null || point.groundSpeed === null || point.groundSpeed < MIN_SPEED_KT) return false;
    const ageMinutes = (nowMs - Date.parse(point.recordedAt)) / 60_000;
    return Number.isFinite(ageMinutes) && ageMinutes >= MIN_LOOKBACK_MINUTES && ageMinutes <= MAX_LOOKBACK_MINUTES;
  });
  if (!candidates.length) return null;
  return candidates.reduce((best, point) => {
    const bestAge = Math.abs((nowMs - Date.parse(best.recordedAt)) / 60_000 - IDEAL_LOOKBACK_MINUTES);
    const pointAge = Math.abs((nowMs - Date.parse(point.recordedAt)) / 60_000 - IDEAL_LOOKBACK_MINUTES);
    return pointAge < bestAge ? point : best;
  });
}

export function detectSigmetTrajectoryDeviation(
  aircraft: AircraftView | null,
  history: readonly TrailPoint[],
  snapshot: SigmetSnapshot,
): SigmetTrajectoryDeviation | null {
  if (!aircraft || aircraft.onGround || aircraft.lat === null || aircraft.lon === null) return null;
  if (aircraft.track === null || aircraft.groundSpeed === null || aircraft.groundSpeed < MIN_SPEED_KT) return null;
  if (!snapshot.features.length || history.length < 2) return null;

  const nowMs = Date.parse(aircraft.lastSeen);
  if (!Number.isFinite(nowMs)) return null;
  const previous = selectLookbackPoint(history, nowMs);
  if (!previous || previous.track === null || previous.groundSpeed === null) return null;

  const delta = headingDelta(previous.track, aircraft.track);
  if (delta < MIN_TURN_DEG) return null;

  const currentAltitude = aircraft.baroAltitude ?? aircraft.altitude ?? aircraft.geomAltitude ?? null;
  const previousAgeMinutes = Math.max(0, (nowMs - Date.parse(previous.recordedAt)) / 60_000);

  let best: SigmetTrajectoryDeviation | null = null;
  for (const feature of snapshot.features) {
    if (pointInSigmetGeometry(previous.lon, previous.lat, feature.geometry)) continue;
    if (pointInSigmetGeometry(aircraft.lon, aircraft.lat, feature.geometry)) continue;

    const previousEntry = projectedEntry(
      previous.lat,
      previous.lon,
      previous.track,
      previous.groundSpeed,
      previous.altitude,
      0,
      feature,
    );
    if (!previousEntry) continue;

    // For a course-deviation signal the new path must miss the SIGMET
    // horizontally. Altitude alone must never make a crossing path look like
    // a weather-related turn away from the advisory.
    const currentEntry = projectedEntry(
      aircraft.lat,
      aircraft.lon,
      aircraft.track,
      aircraft.groundSpeed,
      null,
      null,
      feature,
    );
    if (currentEntry) continue;

    const hasVerticalEvidence =
      previous.altitude !== null
      && currentAltitude !== null
      && (feature.properties.lowerFt !== null || feature.properties.upperFt !== null);
    const confidence: "low" | "medium" =
      hasVerticalEvidence && delta >= 30 && previousAgeMinutes >= 3 && previousAgeMinutes <= 7 ? "medium" : "low";

    const candidate: SigmetTrajectoryDeviation = {
      sigmetId: feature.id,
      hazard: feature.properties.hazard,
      phenomenon: feature.properties.phenomenon,
      firName: feature.properties.firName,
      previousTrackDeg: previous.track,
      currentTrackDeg: aircraft.track,
      headingChangeDeg: delta,
      lookbackMinutes: previousAgeMinutes,
      previousProjectedEntryMinutes: previousEntry.minutes,
      previousProjectedEntryDistanceNm: previousEntry.distanceNm,
      confidence,
    };

    if (!best
      || candidate.confidence === "medium" && best.confidence === "low"
      || candidate.previousProjectedEntryMinutes < best.previousProjectedEntryMinutes) {
      best = candidate;
    }
  }

  return best;
}
