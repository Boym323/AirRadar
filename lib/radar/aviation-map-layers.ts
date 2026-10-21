import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { AIRRADAR_MAP_THEME } from "@/lib/map-theme";
import { createAtcGeoJSON } from "@/lib/radar/airspace-geojson";
import { createAirportGeoJSON, createMetarGeoJSON } from "@/lib/radar/map-context-geojson";

/** Register the static ATC, weather and airport sources during MapLibre style.load.
 * Keep layer ordering stable; callbacks and live data updates stay with the map owner.
 */
export function registerRadarAviationLayers(map: MapLibreMap, initialSigmet: FeatureCollection): void {
  map.addSource("atc-sectors", { type: "geojson", data: createAtcGeoJSON([], false) });
  map.addLayer({ id: "atc-sectors-fill", type: "fill", source: "atc-sectors", layout: { visibility: "none" }, paint: { "fill-color": AIRRADAR_MAP_THEME.atc.fill, "fill-opacity": ["match", ["get", "airspaceType"], "FIR", 0.012, "TMA", 0.022, "CTR", 0.03, 0.045] } });
  map.addLayer({ id: "atc-sectors-line", type: "line", source: "atc-sectors", layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.atc.line, "line-opacity": 0.48, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.75, 8, 1.25, 13, 2] } });
  map.addLayer({ id: "atc-sectors-label", type: "symbol", source: "atc-sectors", minzoom: 6.5, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-offset": [0, 0.8], "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.atc.label, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1.2 } });
  map.addLayer({ id: "atc-sectors-context-highlight", type: "line", source: "atc-sectors", filter: ["==", ["get", "id"], "__context-none__"], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.atc.highlight, "line-opacity": 0.92, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.8, 13, 4.2] } });
  map.addSource("atc-transmitters", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "atc-transmitters-circle", type: "circle", source: "atc-transmitters", layout: { visibility: "none" }, paint: { "circle-color": AIRRADAR_MAP_THEME.atc.line, "circle-radius": 4, "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1.5 } });
  map.addSource("metar-airports", { type: "geojson", data: createMetarGeoJSON([]) });
  map.addLayer({ id: "metar-symbols", type: "circle", source: "metar-airports", layout: { visibility: "none" }, paint: { "circle-color": ["match", ["get", "flightCategory"], "VFR", AIRRADAR_MAP_THEME.metar.vfr, "MVFR", AIRRADAR_MAP_THEME.metar.mvfr, "IFR", AIRRADAR_MAP_THEME.metar.ifr, "LIFR", AIRRADAR_MAP_THEME.metar.lifr, AIRRADAR_MAP_THEME.metar.unknown], "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3, 8, 5, 13, 7], "circle-opacity": ["case", ["get", "stale"], 0.38, 0.9], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1.2 } });
  map.addLayer({ id: "metar-labels", type: "symbol", source: "metar-airports", minzoom: 8.5, layout: { visibility: "none", "text-field": ["concat", ["get", "stationId"], ["case", ["get", "stale"], " · STALE", ""]], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-offset": [0, 1.25], "text-padding": 6, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.label, "text-opacity": ["case", ["get", "stale"], 0.45, 0.82], "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1 } });
  map.addSource("route-airports", { type: "geojson", data: createAirportGeoJSON([]) });
  map.addLayer({ id: "route-airports-circle", type: "circle", source: "route-airports", paint: { "circle-color": ["match", ["get", "tier"], "significant", AIRRADAR_MAP_THEME.airports.significant, "heliport", AIRRADAR_MAP_THEME.airports.heliport, AIRRADAR_MAP_THEME.airports.small], "circle-opacity": ["match", ["get", "tier"], "significant", 0.82, "heliport", 0.58, 0.52], "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.4, 9, 3.3, 13, 4.6], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1.15 } });
  map.addLayer({ id: "route-airports-label", type: "symbol", source: "route-airports", minzoom: 6.2, layout: { "text-field": ["get", "code"], "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 6.2, 8, 10, 9, 13, 10], "text-offset": [0, 1.1], "text-padding": 7, "text-allow-overlap": false, "text-ignore-placement": false, "text-optional": true }, paint: { "text-color": AIRRADAR_MAP_THEME.airports.label, "text-opacity": ["interpolate", ["linear"], ["zoom"], 6.2, 0.52, 10, 0.72, 13, 0.86], "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 0.8 } });
  map.addSource("aviation-sigmet", { type: "geojson", data: initialSigmet });
  map.addLayer({ id: "aviation-sigmet-fill", type: "fill", source: "aviation-sigmet", layout: { visibility: "none" }, paint: { "fill-color": AIRRADAR_MAP_THEME.hazard, "fill-opacity": 0.04 } });
  map.addLayer({ id: "aviation-sigmet-line", type: "line", source: "aviation-sigmet", layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.hazard, "line-opacity": 0.68, "line-width": 1.3, "line-dasharray": [2, 2] } });
}
