import { normalizeBearing } from "@/lib/spotter-location";

export type SkyFinderTurn = "ahead" | "left" | "right" | "behind";

export interface SkyFinderDirection {
  targetAzimuthDeg: number;
  deviceHeadingDeg: number;
  relativeTurnDeg: number;
  turn: SkyFinderTurn;
}

export function shortestTurnDeg(targetAzimuthDeg: number, deviceHeadingDeg: number): number {
  const target = normalizeBearing(targetAzimuthDeg);
  const heading = normalizeBearing(deviceHeadingDeg);
  return ((target - heading + 540) % 360) - 180;
}

export function skyFinderDirection(targetAzimuthDeg: number, deviceHeadingDeg: number): SkyFinderDirection {
  const relativeTurnDeg = shortestTurnDeg(targetAzimuthDeg, deviceHeadingDeg);
  const absoluteTurn = Math.abs(relativeTurnDeg);
  const turn: SkyFinderTurn = absoluteTurn <= 15
    ? "ahead"
    : absoluteTurn >= 150
      ? "behind"
      : relativeTurnDeg < 0
        ? "left"
        : "right";
  return {
    targetAzimuthDeg: normalizeBearing(targetAzimuthDeg),
    deviceHeadingDeg: normalizeBearing(deviceHeadingDeg),
    relativeTurnDeg,
    turn,
  };
}

export function headingFromDeviceOrientation(
  event: Pick<DeviceOrientationEvent, "alpha" | "absolute"> & { webkitCompassHeading?: number },
): number | null {
  if (
    typeof event.webkitCompassHeading === "number"
    && Number.isFinite(event.webkitCompassHeading)
  ) {
    return normalizeBearing(event.webkitCompassHeading);
  }
  if (event.absolute && typeof event.alpha === "number" && Number.isFinite(event.alpha)) {
    return normalizeBearing(360 - event.alpha);
  }
  return null;
}
