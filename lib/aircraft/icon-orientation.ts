import type { AircraftPresentationKind } from "@/lib/aircraft/icon-classification";

export const TAR1090_ICON_ROTATION_OFFSET_DEG = 180;
const TAR1090_ASSET_PREFIX = "/aircraft-icons-tar1090/";

/**
 * The bundled tar1090 SVG family uses the opposite visual basis from the
 * geographic heading used by AirRadar. This 180° presentation correction was
 * previously applied at the marker boundary; keep it asset-scoped so other
 * icon families and the motion model remain untouched.
 */
const AIRCRAFT_ICON_ROTATION_OFFSETS: Partial<Record<AircraftPresentationKind | string, number>> = {};

export function aircraftIconRotationOffset(assetOrType: string | null | undefined): number {
  if (!assetOrType) return 0;
  if (assetOrType.startsWith(TAR1090_ASSET_PREFIX)) return TAR1090_ICON_ROTATION_OFFSET_DEG;
  return AIRCRAFT_ICON_ROTATION_OFFSETS[assetOrType] ?? 0;
}
