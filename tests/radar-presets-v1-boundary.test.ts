import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const menu = readFileSync(new URL("../components/radar/radar-preset-menu.tsx", import.meta.url), "utf8");
const model = readFileSync(new URL("../lib/radar/presets.ts", import.meta.url), "utf8");

describe("Radar Presets V1 boundary", () => {
  it("is browser-local and introduces no API or persistence path", () => {
    expect(model).toContain('RADAR_PRESETS_STORAGE_KEY = "airradar.radar-presets.v1"');
    expect(model).not.toContain("fetch(");
    expect(model).not.toContain("getPrisma");
    expect(menu).not.toContain("fetch(");
  });

  it("captures existing radar state and applies it through existing setters", () => {
    expect(app).toContain("createRadarPreset({");
    expect(app).toContain("setCoverage(preset.coverage)");
    expect(app).toContain("setMapFilters(preset.mapFilters)");
    expect(app).toContain("setShowWeatherRadar(preset.layers.showWeatherRadar)");
    expect(app).toContain("setShowAupUup(preset.layers.showAupUup)");
    expect(app).toContain("map.easeTo({");
  });

  it("never stores selected aircraft or runtime traffic state", () => {
    expect(model).not.toContain("selectedHex");
    expect(model).not.toContain("snapshot");
    expect(model).not.toContain("aircraft:");
  });
});
