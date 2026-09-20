import { normalizeHeading } from "@/lib/aircraft/motion";

export interface VisualHeadingInput {
  /** The heading produced by the motion model for this rendered frame. */
  motionHeading?: number | null;
  /** Reported ADS-B track used when no rendered motion heading exists. */
  track?: number | null;
  /** Position-derived heading used as the final presentation fallback. */
  positionHeading?: number | null;
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
  const geographicHeading = normalizeHeading(input.motionHeading ?? input.track ?? input.positionHeading);
  if (geographicHeading === null) return null;
  return normalizeHeading(
    geographicHeading
      - (input.mapBearing ?? 0)
      + (input.assetOffset ?? 0),
  );
}
