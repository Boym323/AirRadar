import type { FeatureCollection, Feature, Point } from "geojson";
import type { SondeHubObservation } from "@/lib/server/sondehub";

/** Radiosonde markers never enter canonical ADS-B or OGN feature collections. */
export function createSondeHubGeoJSON(
  observations: readonly SondeHubObservation[],
): FeatureCollection<Point> {
  const features: Feature<Point>[] = observations.slice(0, 300).map((sonde) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [sonde.longitude, sonde.latitude] },
    properties: {
      serial: sonde.serial,
      altitudeM: Math.round(sonde.altitudeM),
      observedAt: sonde.observedAt,
      ascentMs: sonde.ascentMs,
      sondeType: sonde.sondeType,
    },
  }));
  return { type: "FeatureCollection", features };
}
