import { shortestTurnDeg } from "@/lib/spotter-sky-finder";

export interface CameraProjection {
  xPercent: number;
  yPercent: number;
  azimuthDeltaDeg: number;
  elevationDeltaDeg: number;
}
/** Portrait, rear-facing camera approximation. Requires a near-upright phone. */
export function cameraElevationFromOrientation(event: Pick<DeviceOrientationEvent, "beta" | "gamma">): number | null {
  if (typeof event.beta !== "number" || !Number.isFinite(event.beta)
      || typeof event.gamma !== "number" || !Number.isFinite(event.gamma)
      || Math.abs(event.gamma) > 35) return null;
  return Math.max(-90, Math.min(90, 90 - event.beta));
}

/** Conservative pinhole projection; markers outside the viewport are discarded, never clamped to the horizon. */
export function projectAircraftToCamera(
  bearingDeg: number,
  elevationDeg: number,
  headingDeg: number,
  cameraElevationDeg: number,
  horizontalFovDeg = 65,
  verticalFovDeg = 50,
): CameraProjection | null {
  if (![bearingDeg, elevationDeg, headingDeg, cameraElevationDeg, horizontalFovDeg, verticalFovDeg].every(Number.isFinite)
      || horizontalFovDeg <= 0 || verticalFovDeg <= 0 || horizontalFovDeg >= 180 || verticalFovDeg >= 180) return null;
  const azimuthDeltaDeg = shortestTurnDeg(bearingDeg, headingDeg);
  const elevationDeltaDeg = elevationDeg - cameraElevationDeg;
  if (Math.abs(azimuthDeltaDeg) > horizontalFovDeg / 2 || Math.abs(elevationDeltaDeg) > verticalFovDeg / 2) return null;
  const radians = Math.PI / 180;
  const xPercent = 50 + 50 * Math.tan(azimuthDeltaDeg * radians) / Math.tan(horizontalFovDeg * radians / 2);
  const yPercent = 50 - 50 * Math.tan(elevationDeltaDeg * radians) / Math.tan(verticalFovDeg * radians / 2);
  return { xPercent, yPercent, azimuthDeltaDeg, elevationDeltaDeg };
}
