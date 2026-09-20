import type { AircraftPresentationKind } from "@/lib/aircraft/icon-classification";

export const TAR1090_ICON_ROTATION_OFFSET_DEG = 0;
const TAR1090_ASSET_PREFIX = "/aircraft-icons-tar1090/";

/**
 * The bundled tar1090 SVG family is north-up at zero degrees. Keep this
 * lookup explicit so future asset families can declare their own basis
 * without reintroducing a global rotation correction.
 */
const AIRCRAFT_ICON_ROTATION_OFFSETS: Partial<Record<AircraftPresentationKind | string, number>> = {};

export function aircraftIconRotationOffset(assetOrType: string | null | undefined): number {
  if (!assetOrType) return 0;
  if (assetOrType.startsWith(TAR1090_ASSET_PREFIX)) return TAR1090_ICON_ROTATION_OFFSET_DEG;
  return AIRCRAFT_ICON_ROTATION_OFFSETS[assetOrType] ?? 0;
}
