import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { AIRRADAR_MAP_THEME } from "@/lib/map-theme";
import { applyAirRadarBasemapReadability } from "@/lib/map-style";

/** Static overlay graph. Called once after each new map instance emits style.load. */
interface InitialRadarSources {
  radarImageUrl: string;
  radarCoordinates: [[number, number], [number, number], [number, number], [number, number]];
  emptyAts: FeatureCollection;
  emptyNavigationIntegrity: FeatureCollection;
}

export function registerRadarBaseOverlays(map: MapLibreMap, { radarImageUrl, radarCoordinates, emptyAts, emptyNavigationIntegrity }: InitialRadarSources): void {
  map.addSource("map-tint", {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
      },
    },
  });
  const firstBasemapSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    { id: "map-tint", type: "fill", source: "map-tint", paint: { "fill-color": AIRRADAR_MAP_THEME.mapTint, "fill-opacity": 0.13 } },
    firstBasemapSymbolLayerId,
  );
  applyAirRadarBasemapReadability(map);
  map.addSource("weather-radar-image", { type: "image", url: radarImageUrl, coordinates: radarCoordinates });
  map.addLayer({ id: "weather-radar-layer", type: "raster", source: "weather-radar-image", layout: { visibility: "none" }, paint: { "raster-opacity": 0.42, "raster-fade-duration": 0 } });
  map.addSource("navigation-integrity", { type: "geojson", data: emptyNavigationIntegrity });
  map.addLayer({ id: "navigation-integrity-fill", type: "fill", source: "navigation-integrity", layout: { visibility: "none" }, paint: { "fill-color": ["match", ["get", "state"], "SEVERE", AIRRADAR_MAP_THEME.hazard, "DEGRADED", AIRRADAR_MAP_THEME.warning, AIRRADAR_MAP_THEME.warning], "fill-opacity": 0.14 } });
  map.addLayer({ id: "navigation-integrity-line", type: "line", source: "navigation-integrity", layout: { visibility: "none" }, paint: { "line-color": ["match", ["get", "state"], "SEVERE", AIRRADAR_MAP_THEME.hazard, AIRRADAR_MAP_THEME.warning], "line-opacity": 0.55, "line-width": 1.1, "line-dasharray": [2, 2] } });
  map.addSource("aviation-nav-data", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "aviation-nav-data-points", type: "circle", source: "aviation-nav-data", minzoom: 6.5, layout: { visibility: "none" }, paint: { "circle-color": ["case", ["==", ["get", "routeMatched"], true], AIRRADAR_MAP_THEME.accent, ["==", ["get", "kind"], "NAVAID"], AIRRADAR_MAP_THEME.routes.atsCdr, AIRRADAR_MAP_THEME.labelMuted], "circle-radius": ["interpolate", ["linear"], ["zoom"], 6.5, ["case", ["==", ["get", "routeMatched"], true], 3, 2], 10, ["case", ["==", ["get", "routeMatched"], true], 4, 3], 13, ["case", ["==", ["get", "routeMatched"], true], 5, 4]], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1 } });
  map.addLayer({ id: "aviation-nav-data-labels", type: "symbol", source: "aviation-nav-data", minzoom: 8.5, layout: { visibility: "none", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 9, "text-offset": [0, 1.1], "text-padding": 8, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.labelMuted, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1 } });
  map.addSource("ats-routes", { type: "geojson", data: emptyAts });
  map.addLayer({ id: "ats-routes-line", type: "line", source: "ats-routes", minzoom: 5.5, layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.routes.ats, "line-opacity": 0.58, "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 0.9, 8, 1.5, 13, 2.2] } });
  map.addLayer({ id: "ats-routes-cdr", type: "line", source: "ats-routes", minzoom: 5.5, filter: ["!=", ["get", "availabilityClass"], null], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.routes.atsCdr, "line-opacity": 0.64, "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 0.9, 8, 1.6, 13, 2.4], "line-dasharray": [2, 2] } });
  map.addLayer({ id: "ats-routes-selected", type: "line", source: "ats-routes", filter: ["==", ["get", "routeDesignator"], ""], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.selectedStrong, "line-opacity": 0.96, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.8, 8, 2.7, 13, 4] } });
  map.addLayer({ id: "ats-route-context-highlight", type: "line", source: "ats-routes", filter: ["==", ["get", "segmentId"], "__context-none__"], layout: { visibility: "none" }, paint: { "line-color": AIRRADAR_MAP_THEME.selectedStrong, "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 8, 4, 13, 6] } });
  map.addSource("ats-route-labels", { type: "geojson", data: emptyAts });
  map.addLayer({ id: "ats-route-labels", type: "symbol", source: "ats-route-labels", minzoom: 7.5, layout: { visibility: "none", "symbol-placement": "line", "text-field": ["get", "routeDesignator"], "text-font": ["Noto Sans Regular"], "text-size": 10, "text-padding": 18, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.label, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1.1 } });
  map.addSource("ats-route-points", { type: "geojson", data: emptyAts });
  map.addLayer({ id: "ats-route-points", type: "circle", source: "ats-route-points", minzoom: 8.5, layout: { visibility: "none" }, paint: { "circle-color": ["case", ["==", ["get", "kind"], "NAVAID"], AIRRADAR_MAP_THEME.routes.atsCdr, AIRRADAR_MAP_THEME.labelMuted], "circle-radius": ["interpolate", ["linear"], ["zoom"], 8.5, 2.5, 13, 4], "circle-stroke-color": AIRRADAR_MAP_THEME.outline, "circle-stroke-width": 1 } });
  map.addLayer({ id: "ats-route-points-label", type: "symbol", source: "ats-route-points", minzoom: 10, layout: { visibility: "none", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 9, "text-offset": [0, 1.1], "text-padding": 5, "text-allow-overlap": false, "text-ignore-placement": false }, paint: { "text-color": AIRRADAR_MAP_THEME.labelMuted, "text-halo-color": AIRRADAR_MAP_THEME.outline, "text-halo-width": 1 } });
}
