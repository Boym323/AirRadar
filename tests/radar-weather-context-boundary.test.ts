import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const contextSource = readFileSync(new URL("../components/radar/use-radar-weather-context.ts", import.meta.url), "utf8");

describe("radar weather context boundary", () => {
  it("keeps weather polling and generation guards outside AirRadarApp", () => {
    for (const endpoint of [
      "/api/weather/radar/frames",
      "/api/weather/metar-map",
      "/api/weather/wind",
      "/api/weather/sigmet",
    ]) {
      expect(appSource).not.toContain(endpoint);
      expect(contextSource).toContain(endpoint);
    }
    expect(appSource).not.toContain("radarGenerationRef");
    expect(appSource).not.toContain("windGenerationRef");
    expect(appSource).not.toContain("sigmetGenerationRef");
  });

  it("keeps MapLibre layer rendering in the map component", () => {
    expect(appSource).toContain('getSource("weather-radar-image")');
    expect(appSource).toContain('getSource("metar-airports")');
    expect(appSource).toContain('getSource("wind-aloft")');
    expect(appSource).toContain('getSource("aviation-sigmet")');
    expect(contextSource).not.toContain("maplibre");
  });

  it("owns radar playback and stale/availability state in the context hook", () => {
    expect(contextSource).toContain("setRadarFrameId");
    expect(contextSource).toContain("setRadarPlaying");
    expect(contextSource).toContain("setMetarStatus");
    expect(contextSource).toContain("setWindStatus");
    expect(contextSource).toContain("setSigmetEnabled");
  });
});
