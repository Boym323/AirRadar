import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { registerRadarBaseOverlays } from "@/lib/radar/base-map-overlays";

describe("base map overlay registration", () => {
  it("preserves the entire source graph and ordering before map interaction wiring", () => {
    const operations: string[] = [];
    const sources = new Map<string, unknown>();
    const layers = new Map<string, Record<string, unknown>>();
    const map = {
      getStyle() { return { layers: [{ id: "base-background", type: "background" }, { id: "base-labels", type: "symbol" }] }; },
      addSource(id: string, source: unknown) { operations.push("source:" + id); sources.set(id, source); },
      addLayer(layer: Record<string, unknown>, before?: string) {
        operations.push("layer:" + layer.id + (before ? ":before:" + before : ""));
        layers.set(layer.id as string, layer);
      },
      getLayer(id: string) { return layers.get(id); },
      setPaintProperty() {},
      setLayoutProperty() {},
    } as unknown as MapLibreMap;
    const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
    registerRadarBaseOverlays(map, {
      radarImageUrl: "data:image/png;base64,AA==",
      radarCoordinates: [[0, 1], [1, 1], [1, 0], [0, 0]],
      emptyAts: empty,
      emptyProcedures: empty,
      emptyNavigationIntegrity: empty,
    });
    expect(operations.filter((x) => x.startsWith("source:"))).toEqual([
      "source:map-tint", "source:weather-radar-image", "source:navigation-integrity",
      "source:range-rings", "source:aviation-nav-data", "source:ats-routes",
      "source:procedures-sid", "source:procedures-star",
      "source:ats-route-labels", "source:ats-route-points",
    ]);
    expect(operations).toContain("layer:map-tint:before:base-labels");
    expect(layers.get("weather-radar-layer")).toMatchObject({ source: "weather-radar-image", layout: { visibility: "none" } });
    expect(layers.get("ats-routes-selected")).toMatchObject({ source: "ats-routes", layout: { visibility: "none" } });
    expect(layers.get("navigation-integrity-fill")).toMatchObject({ source: "navigation-integrity", layout: { visibility: "none" } });
    expect(sources.get("weather-radar-image")).toMatchObject({ url: "data:image/png;base64,AA==" });
    expect(sources.get("procedures-sid")).toMatchObject({ data: empty });
  });

  it("keeps the actual map owner responsible for style.load and map events", () => {
    const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    expect(app).toContain('map.once("style.load", () => {');
    expect(app).toContain("registerRadarBaseOverlays(map, {");
    expect(app).toContain("registerRadarAviationLayers(map,");
    expect(app).not.toContain('map.addSource("map-tint"');
    expect(app).not.toContain('map.addSource("ats-routes"');
  });
});
