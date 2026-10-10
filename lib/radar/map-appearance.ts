import type { Map as MapLibreMap } from "maplibre-gl";

/** Style-paint-only V6-B presets; never call map.setStyle(), which would drop AirRadar overlays. */
export type RadarMapAppearance = "dark" | "light" | "satellite";
export function isRadarMapAppearance(value: unknown): value is RadarMapAppearance {
  return value === "dark" || value === "light" || value === "satellite";
}

export const RADAR_SATELLITE_SOURCE_ID = "radar-v6-satellite";
export const RADAR_SATELLITE_LAYER_ID = "radar-v6-satellite-layer";
export const RADAR_SATELLITE_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
export const RADAR_SATELLITE_ATTRIBUTION = 'EOxCloudless <a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2020)';

type NativeLayer = { id: string; type: string; paint?: Record<string, unknown> };
type NativePaintCache = Map<string, Record<string, unknown>>;
const nativePaints = new WeakMap<MapLibreMap, NativePaintCache>();

const LIGHT_PAINT: Record<string, string> = {
  "background-color": "#eaf1f5",
  "fill-color": "#e5ede8",
  "line-color": "#a1b3bd",
  "text-color": "#334959",
  "text-halo-color": "#f9fbfd",
  "circle-color": "#91afbd",
};

export function lightBasemapPaint(layer: NativeLayer): Record<string, string> {
  const paint = layer.paint ?? {};
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(LIGHT_PAINT)) {
    if (!(key in paint)) continue;
    if (key === "fill-color" || key === "line-color") {
      next[key] = /water|ocean|sea|river|lake/i.test(layer.id) ? "#b7dfe9"
        : /park|forest|vegetation|landcover/i.test(layer.id) ? "#c6dfcd"
          : value;
    } else {
      next[key] = value;
    }
  }
  return next;
}

export function applyRadarMapAppearance(map: MapLibreMap, nativeIds: readonly string[], mode: RadarMapAppearance): void {
  if (!map.getLayer("map-tint") || !nativeIds.length) return;
  let originals = nativePaints.get(map);
  if (!originals) {
    originals = new Map();
    nativePaints.set(map, originals);
    const ids = new Set(nativeIds);
    for (const layer of map.getStyle().layers ?? []) {
      if (!ids.has(layer.id)) continue;
      const paint = "paint" in layer ? layer.paint as Record<string, unknown> | undefined : undefined;
      originals.set(layer.id, { ...(paint ?? {}) });
    }
  }
  for (const layer of map.getStyle().layers ?? []) {
    const original = originals.get(layer.id);
    if (!original) continue;
    const update = lightBasemapPaint({ id: layer.id, type: layer.type, paint: original });
    for (const key of Object.keys(update)) {
      map.setPaintProperty(layer.id, key, mode === "light" ? update[key] : original[key]);
    }
  }
  map.setPaintProperty("map-tint", "fill-opacity", mode === "dark" ? 0.13 : mode === "light" ? 0 : 0.05);

  // Source is lazy: no satellite requests in the default dark or light modes.
  if (mode === "satellite" && !map.getSource(RADAR_SATELLITE_SOURCE_ID)) {
    map.addSource(RADAR_SATELLITE_SOURCE_ID, {
      type: "raster",
      tiles: [RADAR_SATELLITE_TILES],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 14,
      attribution: RADAR_SATELLITE_ATTRIBUTION,
    });
    map.addLayer({
      id: RADAR_SATELLITE_LAYER_ID,
      type: "raster",
      source: RADAR_SATELLITE_SOURCE_ID,
      paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
    }, "map-tint");
  }
  if (map.getLayer(RADAR_SATELLITE_LAYER_ID)) {
    map.setLayoutProperty(RADAR_SATELLITE_LAYER_ID, "visibility", mode === "satellite" ? "visible" : "none");
  }
}
