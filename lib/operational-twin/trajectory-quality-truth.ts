import type { Aircraft } from "@/lib/aircraft/types";
import { positionObservedAt } from "@/lib/aircraft/source-merge";

// Shared, unchanged truth selection for both trajectory-quality calibration versions.
const TRUTH_TOLERANCE_MS = 20_000;

export function finiteAltitude(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function currentAltitudeFt(aircraft: Aircraft): number | null {
  if (finiteAltitude(aircraft.baroAltitude)) return aircraft.baroAltitude;
  if (finiteAltitude(aircraft.altitude)) return aircraft.altitude;
  if (finiteAltitude(aircraft.geomAltitude)) return aircraft.geomAltitude;
  return null;
}

export function truthAltitudeAt(aircraft: Aircraft, targetAt: number): number | null {
  let bestAltitude: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  // Do not allocate a new last-20 trail array for every pending outcome.
  for (let i = Math.max(0, aircraft.trail.length - 20); i < aircraft.trail.length; i += 1) {
    const point = aircraft.trail[i]!;
    const at = Date.parse(point.recordedAt);
    if (!Number.isFinite(at) || !finiteAltitude(point.altitude)) continue;
    const delta = Math.abs(at - targetAt);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestAltitude = point.altitude;
    }
  }

  const observedAt = positionObservedAt(aircraft);
  const currentAltitude = currentAltitudeFt(aircraft);
  if (observedAt !== null && currentAltitude !== null) {
    const delta = Math.abs(observedAt - targetAt);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestAltitude = currentAltitude;
    }
  }

  return bestDelta <= TRUTH_TOLERANCE_MS ? bestAltitude : null;
}

