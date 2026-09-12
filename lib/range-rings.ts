import { circleCoordinates } from "@/lib/geo";
import type { ReceiverPosition } from "@/lib/aircraft/types";

export const RANGE_RING_RADII_KM = [50, 100, 200, 300, 400, 463] as const;

export function createRangeRingsGeoJSON(
  receiver: ReceiverPosition,
  radii: readonly number[] = RANGE_RING_RADII_KM,
) {
  const features = radii
    .filter((radiusKm) => Number.isFinite(radiusKm) && radiusKm > 0)
    .map((radiusKm) => ({
      type: "Feature" as const,
      properties: { radiusKm },
      geometry: { type: "LineString" as const, coordinates: circleCoordinates(receiver.lat, receiver.lon, radiusKm) },
    }));
  return { type: "FeatureCollection" as const, features };
}
