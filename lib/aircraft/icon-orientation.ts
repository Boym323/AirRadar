import type { AircraftPresentationKind } from "@/lib/aircraft/icon-classification";

/**
 * The tar1090 silhouettes bundled by AirRadar are north-up at zero degrees.
 * Keep this lookup explicit so a future asset family can declare its own
 * basis without reintroducing a global rotation correction.
 */
const AIRCRAFT_ICON_ROTATION_OFFSETS: Partial<Record<AircraftPresentationKind | string, number>> = {};

export function aircraftIconRotationOffset(assetOrType: string | null | undefined): number {
  if (!assetOrType) return 0;
  return AIRCRAFT_ICON_ROTATION_OFFSETS[assetOrType] ?? 0;
}
