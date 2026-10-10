import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { isRadar3dMode, RADAR_TERRAIN_SOURCE_ID, setRadar3dTerrain } from "@/lib/radar/terrain-v6-d";

describe("V6-D1 optional terrain", () => {
  it("rejects unexpected values", () => {
    expect(isRadar3dMode("3d")).toBe(true);
    expect(isRadar3dMode("2d")).toBe(true);
    expect(isRadar3dMode("satellite")).toBe(false);
  });
  it("does not request terrain in default flat mode", () => {
    const map = { getTerrain: vi.fn(() => null), getPitch: vi.fn(() => 0), setTerrain: vi.fn(), addSource: vi.fn(), easeTo: vi.fn() };
    setRadar3dTerrain(map as unknown as MapLibreMap, "2d");
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.setTerrain).not.toHaveBeenCalled();
  });
  it("enables DEM without reloading map style", () => {
    const map = { getSource: vi.fn(() => undefined), addSource: vi.fn(), getTerrain: vi.fn(() => null), setTerrain: vi.fn(), getPitch: vi.fn(() => 0), easeTo: vi.fn(), setStyle: vi.fn() };
    setRadar3dTerrain(map as unknown as MapLibreMap, "3d");
    expect(map.addSource).toHaveBeenCalledWith(RADAR_TERRAIN_SOURCE_ID, expect.objectContaining({ type: "raster-dem", encoding: "terrarium", tileSize: 512 }));
    expect(map.setTerrain).toHaveBeenCalledWith({ source: RADAR_TERRAIN_SOURCE_ID, exaggeration: 1 });
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 58 }));
    expect(map.setStyle).not.toHaveBeenCalled();
  });
  it("disables DEM and returns to flat 2D", () => {
    const map = { getTerrain: vi.fn(() => ({ source: RADAR_TERRAIN_SOURCE_ID })), getPitch: vi.fn(() => 58), setTerrain: vi.fn(), easeTo: vi.fn() };
    setRadar3dTerrain(map as unknown as MapLibreMap, "2d");
    expect(map.setTerrain).toHaveBeenCalledWith(null);
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ pitch: 0 }));
  });
});
