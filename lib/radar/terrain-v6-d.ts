import type { Map as MapLibreMap } from "maplibre-gl";

/** Opt-in 3D terrain within the existing map; never replace the radar style or SSE runtime. */
export type Radar3dMode = "2d" | "3d";
export const RADAR_TERRAIN_SOURCE_ID = "radar-v6-d-terrain";
export const RADAR_TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";
export const RADAR_TERRAIN_ATTRIBUTION = '<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener noreferrer">© Mapterhorn · Copernicus DEM</a>';

export function isRadar3dMode(value: unknown): value is Radar3dMode {
  return value === "2d" || value === "3d";
}

/** Load terrain tiles only after opt-in; remain 2D when disabled. */
export function setRadar3dTerrain(map: MapLibreMap, mode: Radar3dMode): void {
  if (mode === "2d") {
    if (map.getTerrain()) map.setTerrain(null);
    if (map.getPitch() !== 0) map.easeTo({ pitch: 0, duration: 300 });
    return;
  }
  if (!map.getSource(RADAR_TERRAIN_SOURCE_ID)) {
    map.addSource(RADAR_TERRAIN_SOURCE_ID, {
      type: "raster-dem",
      url: RADAR_TERRAIN_TILEJSON,
      tileSize: 512,
      attribution: RADAR_TERRAIN_ATTRIBUTION,
    });
  }
  if (!map.getTerrain()) map.setTerrain({ source: RADAR_TERRAIN_SOURCE_ID, exaggeration: 1 });
  if (map.getPitch() < 50) map.easeTo({ pitch: 58, duration: 450 });
}
