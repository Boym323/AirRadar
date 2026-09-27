import { normalizeHeading } from "@/lib/aircraft/motion";
import type { AircraftView } from "@/lib/aircraft/types";

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


export const REPORTED_TRUE_HEADING_FRESHNESS_MS = 30_000;

/**
 * Uses a field-level timestamp so an old Comm-B heading cannot keep rotating a
 * live marker merely because unrelated Beast frames are still arriving.
 * Magnetic heading is intentionally not used on the true-north map without a
 * declination correction.
 */
export function aircraftReportedTrueHeading(
  aircraft: Pick<AircraftView, "adsbTelemetry" | "provenance">,
  now = Date.now(),
): number | null {
  const heading = normalizeHeading(aircraft.adsbTelemetry?.trueHeadingDeg);
  if (heading === null) return null;
  const provenance = aircraft.provenance?.fields?.trueHeadingDeg;
  if (!provenance?.observedAt) return null;
  const observedAt = Date.parse(provenance.observedAt);
  if (!Number.isFinite(observedAt) || Math.max(0, now - observedAt) > REPORTED_TRUE_HEADING_FRESHNESS_MS) return null;
  return heading;
}
