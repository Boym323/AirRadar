import { normalizeHeading } from "@/lib/aircraft/motion";

export interface VisualHeadingInput {
  /** The heading produced by the motion model for this rendered frame. */
  motionHeading?: number | null;
  /** Confirmed-position heading used before reported track for presentation. */
  positionHeading?: number | null;
  /** Reported ADS-B track used when no position-derived heading exists. */
  track?: number | null;
  /** Last reported track used when the current observation omits track. */
  lastKnownTrack?: number | null;
  /** Per-asset correction; normalized assets use zero. */
  assetOffset?: number | null;
  /** MapLibre bearing, clockwise from north. */
  mapBearing?: number | null;
}

/**
 * Converts a geographic aircraft heading into a screen-space rotation.
 * MapLibre's map-aligned marker applies `rotation - mapBearing` itself. The
 * aircraft root is deliberately viewport-aligned, so the rotator owns that
 * compensation explicitly instead.
 */
export function resolveAircraftVisualHeading(input: VisualHeadingInput): number | null {
  const geographicHeading = normalizeHeading(input.motionHeading ?? input.positionHeading ?? input.track ?? input.lastKnownTrack);
  if (geographicHeading === null) return null;
  return normalizeHeading(
    geographicHeading
      - (input.mapBearing ?? 0)
      + (input.assetOffset ?? 0),
  );
}
