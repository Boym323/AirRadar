import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mapSource = readFileSync(new URL("../lib/operational-twin/map.ts", import.meta.url), "utf8");
const radarSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

describe("Operational Digital Twin V2 map boundary", () => {
  it("keeps map visualization a pure projection over the existing situation response", () => {
    expect(mapSource).toContain("createOperationalTwinMapGeoJSON");
    expect(mapSource).toContain('OPERATIONAL_TWIN_MAP_SOURCE_ID = "operational-twin-v2"');
    expect(mapSource).not.toContain("fetch(");
    expect(mapSource).not.toContain("EventSource");
    expect(mapSource).not.toContain("getPrisma");
    expect(mapSource).not.toContain("/api/");
  });

  it("reuses the radar's existing selected Operational Twin request without another timer", () => {
    expect(radarSource).toContain("setSelectedOperationalTwin(value)");
    expect(radarSource).toContain('/situation');
    expect(radarSource).toContain("createOperationalTwinMapGeoJSON(availableTwin)");
    expect(radarSource).toContain("map.addSource(OPERATIONAL_TWIN_MAP_SOURCE_ID");
    expect(radarSource.match(/\/situation/g)).toHaveLength(1);
  });

  it("registers uncertainty, route-aware, kinematic, milestone and event layers on style.load", () => {
    expect(radarSource).toContain('map.once("style.load"');
    expect(radarSource).toContain("OPERATIONAL_TWIN_UNCERTAINTY_LAYER_ID");
    expect(radarSource).toContain("OPERATIONAL_TWIN_ROUTE_LAYER_ID");
    expect(radarSource).toContain("OPERATIONAL_TWIN_KINEMATIC_LAYER_ID");
    expect(radarSource).toContain("OPERATIONAL_TWIN_MILESTONE_LABEL_LAYER_ID");
    expect(radarSource).toContain("OPERATIONAL_TWIN_EVENT_LAYER_ID");
    expect(radarSource).toContain("OPERATIONAL_TWIN_WEATHER_EVENT_LAYER_ID");
    expect(radarSource).toContain("OPERATIONAL_TWIN_NAVIGATION_INTEGRITY_LAYER_ID");
    expect(radarSource).toContain('data-testid="operational-twin-map-legend"');
  });
});
