import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { radarWeatherPresentation } from "@/lib/radar/weather-layer-presentation";

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("V5-A3 selected radar frame status", () => {
  const ready = { observedAt: "2026-10-10T11:00:00Z", stale: false };
  const stale = { observedAt: "2026-10-10T08:00:00Z", stale: true };
  it("never displays unavailable or loading data as current", () => {
    expect(radarWeatherPresentation(false, "ready", ready)).toEqual({ state: "off", observedAt: null });
    expect(radarWeatherPresentation(true, "idle", null)).toEqual({ state: "loading", observedAt: null });
    expect(radarWeatherPresentation(true, "loading", ready)).toEqual({ state: "loading", observedAt: null });
    expect(radarWeatherPresentation(true, "unavailable", ready)).toEqual({ state: "unavailable", observedAt: null });
    expect(radarWeatherPresentation(true, "ready", null)).toEqual({ state: "loading", observedAt: null });
  });
  it("uses the freshness of the selected frame", () => {
    expect(radarWeatherPresentation(true, "ready", ready)).toEqual({ state: "ready", observedAt: ready.observedAt });
    expect(radarWeatherPresentation(true, "ready", stale)).toEqual({ state: "stale", observedAt: stale.observedAt });
    expect(radarWeatherPresentation(true, "stale", ready)).toEqual({ state: "stale", observedAt: ready.observedAt });
  });
  it("drops the old image on failure and exposes state/timestamp in UI", () => {
    const hook = file("components/radar/use-radar-weather-context.ts");
    expect(hook).toContain('setRadarCatalog(null);');
    expect(hook).toContain('setRadarFrameId(null);');
    expect(hook).toContain('setRadarPlaying(false);');
    expect(hook).not.toContain('catalog.frames.some((frame) => frame.stale)');
    const app = file("components/airradar-app.tsx");
    expect(app).toContain('data-testid="radar-weather-map-status"');
    expect(app).toContain('data-state={weatherView.state}');
    expect(app).toContain('weatherState={weatherView.state}');
    expect(app).not.toContain('showWeatherRadar && <span className="layer-legend aviation-layer-legend"');
  });
  it("localizes loading, stale and unavailable", () => {
    for (const locale of ["cs", "en"]) {
      const strings = file(`lib/i18n/${locale}.ts`);
      for (const label of ["weatherLoading:", "weatherStale:", "weatherUnavailable:"]) expect(strings).toContain(label);
    }
  });
});
