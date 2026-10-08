import type { Map as MapLibreMap } from "maplibre-gl";
import { AIRRADAR_MAP_THEME } from "@/lib/map-theme";

/** Canonical AirRadar/OpenFreeMap basemap shared by live and historical maps. */
export const AIRRADAR_BASE_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
export const AIRRADAR_MAP_ATTRIBUTION = "© OpenStreetMap contributors · © OpenFreeMap";
// Optional network data attribution belongs in MapLibre's existing bottom-right
// attribution control, not in a floating radar status badge.
export const AIRRADAR_NETWORK_DATA_ATTRIBUTION =
  'Data: <a href="https://www.adsb.lol/" target="_blank" rel="noopener noreferrer">ADSB.lol</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">ODbL 1.0</a>';

export function airRadarMapAttributions(networkEnabled: boolean): string[] {
  return networkEnabled
    ? [AIRRADAR_MAP_ATTRIBUTION, AIRRADAR_NETWORK_DATA_ATTRIBUTION]
    : [AIRRADAR_MAP_ATTRIBUTION];
}


const PLACE_LABEL_LAYER = /(place|settlement|city|town|village|state|country|region)/i;
const AIRPORT_LABEL_LAYER = /(airport|aerodrome|aeroway)/i;
const BOUNDARY_LAYER = /(boundary|admin)/i;

/**
 * Keep the dark OpenFreeMap character while making orientation cues readable.
 * This deliberately avoids road/POI labels so aircraft remain the strongest
 * visual objects on the radar.
 */
export function applyAirRadarBasemapReadability(map: MapLibreMap): void {
  const layers = map.getStyle().layers ?? [];

  for (const layer of layers) {
    const id = layer.id;

    try {
      if (layer.type === "symbol" && (PLACE_LABEL_LAYER.test(id) || AIRPORT_LABEL_LAYER.test(id))) {
        const airport = AIRPORT_LABEL_LAYER.test(id);
        map.setPaintProperty(id, "text-color", airport ? AIRRADAR_MAP_THEME.basemap.airportLabel : AIRRADAR_MAP_THEME.basemap.placeLabel);
        map.setPaintProperty(id, "text-halo-color", AIRRADAR_MAP_THEME.outline);
        map.setPaintProperty(id, "text-halo-width", airport ? 1.3 : 1.1);
        map.setPaintProperty(id, "text-opacity", [
          "interpolate", ["linear"], ["zoom"],
          3, airport ? 0.46 : 0.38,
          6, airport ? 0.72 : 0.62,
          9, airport ? 0.9 : 0.78,
        ]);
      } else if (layer.type === "line" && BOUNDARY_LAYER.test(id)) {
        map.setPaintProperty(id, "line-color", AIRRADAR_MAP_THEME.basemap.boundary);
        map.setPaintProperty(id, "line-opacity", [
          "interpolate", ["linear"], ["zoom"],
          3, 0.34,
          6, 0.5,
          9, 0.62,
        ]);
      }
    } catch {
      // Third-party basemap styles can expose layer-specific paint schemas.
      // Unsupported properties should never prevent the radar from loading.
    }
  }
}
