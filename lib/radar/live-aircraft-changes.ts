import type { AircraftView } from "@/lib/aircraft/types";

export interface PendingAircraftChanges {
  full: boolean;
  changedHexes: Set<string>;
  removedHexes: Set<string>;
}

export interface AircraftChangeBatch {
  full: boolean;
  changedAircraft: readonly AircraftView[];
  removedHexes: readonly string[];
}

/**
 * Merges multiple SSE batches before the next MapLibre frame. The latest
 * operation for one ICAO wins so a remove followed by a reappearance cannot
 * leave the marker in both pending sets.
 */
export function mergePendingAircraftChanges(
  current: PendingAircraftChanges | null,
  change: AircraftChangeBatch,
): PendingAircraftChanges {
  const pending = current ?? {
    full: false,
    changedHexes: new Set<string>(),
    removedHexes: new Set<string>(),
  };

  pending.full ||= change.full;
  for (const aircraft of change.changedAircraft) {
    pending.removedHexes.delete(aircraft.icaoHex);
    pending.changedHexes.add(aircraft.icaoHex);
  }
  for (const hex of change.removedHexes) {
    pending.changedHexes.delete(hex);
    pending.removedHexes.add(hex);
  }
  return pending;
}
