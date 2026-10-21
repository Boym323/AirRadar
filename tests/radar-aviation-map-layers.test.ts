import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { readFileSync } from "node:fs";
import { registerRadarAviationLayers } from "@/lib/radar/aviation-map-layers";

describe("MapLibre aviation registration boundary", () => {
  it("registers expected sources and layers in stable order without changing placeholder data", () => {
    const sourceIds: string[] = [];
    const layerIds: string[] = [];
    const movedIds: string[] = [];
    const sources = new Map<string, unknown>();
    const layers = new Map<string, Record<string, unknown>>();
    const fakeMap = {
      addSource(id: string, config: unknown) { sourceIds.push(id); sources.set(id, config); },
      addLayer(config: Record<string, unknown>) { layerIds.push(config.id as string); layers.set(config.id as string, config); },
      moveLayer(id: string) { movedIds.push(id); },
    } as unknown as MapLibreMap;
    const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
    registerRadarAviationLayers(fakeMap, empty);
    expect(sourceIds).toEqual(["atc-sectors", "atc-transmitters", "metar-airports", "route-airports", "aviation-sigmet"]);
    expect(layerIds).toEqual([
      "atc-sectors-fill", "atc-sectors-line", "atc-sectors-label", "atc-sectors-context-highlight",
      "atc-transmitters-circle", "metar-symbols", "metar-labels",
      "route-airports-circle", "route-airports-label", "aviation-sigmet-fill", "aviation-sigmet-line",
    ]);
    expect(movedIds).toEqual([]);
    expect(sources.get("aviation-sigmet")).toMatchObject({ type: "geojson", data: empty });
    expect(layers.get("metar-labels")).toMatchObject({ source: "metar-airports", type: "symbol", layout: { visibility: "none" } });
    expect(layers.get("atc-sectors-context-highlight")).toMatchObject({ source: "atc-sectors", layout: { visibility: "none" } });
  });

  it("keeps initialization attached to style.load, not tied to selecting an aircraft", () => {
    const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    const load = app.indexOf('map.once("style.load"');
    const registration = app.indexOf("registerRadarAviationLayers(map,");
    expect(load).toBeGreaterThan(-1);
    expect(registration).toBeGreaterThan(load);
    expect(app).not.toContain('map.addSource("atc-sectors"');
    expect(app).not.toContain('map.addSource("metar-airports"');
  });
});
