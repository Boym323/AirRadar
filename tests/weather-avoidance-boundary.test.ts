import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("Removed Weather Avoidance UI boundary", () => {
  it("does not compute or pass Weather Avoidance in live radar selection", () => {
    const app = read("components/airradar-app.tsx");
    const drawer = read("components/radar/radar-drawer-details.tsx");
    expect(app).not.toContain("buildWeatherAvoidanceIntelligence");
    expect(app).not.toContain("selectedWeatherAvoidance");
    expect(drawer).not.toContain("weatherAvoidance");
  });

  it("retains SIGMET aircraft context, observational deviation and navigation integrity", () => {
    const panel = read("components/aircraft-radar-quick-detail.tsx");
    expect(panel).toContain("<SigmetSection");
    expect(panel).toContain("aircraft-sigmet-context");
    expect(panel).toContain("sigmet-trajectory-deviation");
    expect(panel).toContain("<NavigationIntegritySection");
    expect(panel).not.toContain("WeatherAvoidanceIntelligence");
    expect(panel).not.toContain("weather-avoidance-intelligence-v1");
    expect(panel).not.toContain("avoidance={");
  });

  it("keeps the legacy analytical module isolated until server-side dependency audit", () => {
    const source = read("lib/weather/avoidance-intelligence.ts");
    expect(source).toContain("buildWeatherAvoidanceIntelligence");
    expect(source).not.toContain("getPrisma");
  });
});
