import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RadarTrafficHero } from "../components/radar/radar-traffic-hero";
import { t } from "../lib/i18n";
import {
  analyzeVisualSystem,
  assertVisualSystemBudget,
} from "../scripts/visual-system-audit.mjs";
import { AIRRADAR_MAP_THEME } from "../lib/map-theme";
import { AIRRADAR_MAP_ATTRIBUTION, AIRRADAR_NETWORK_DATA_ATTRIBUTION, airRadarMapAttributions } from "../lib/map-style";

describe("visual system v3.1", () => {
  it("moves optional ADSB.lol licensing into MapLibre attribution without a floating badge", () => {
    expect(airRadarMapAttributions(false)).toEqual([AIRRADAR_MAP_ATTRIBUTION]);
    expect(airRadarMapAttributions(true)).toEqual([
      AIRRADAR_MAP_ATTRIBUTION,
      AIRRADAR_NETWORK_DATA_ATTRIBUTION,
    ]);
    expect(AIRRADAR_NETWORK_DATA_ATTRIBUTION).toContain('href="https://www.adsb.lol/"');
    expect(AIRRADAR_NETWORK_DATA_ATTRIBUTION).toContain('href="https://opendatacommons.org/licenses/odbl/1-0/"');

    const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    expect(app).toContain('customAttribution: airRadarMapAttributions(networkEnabled)');
    expect(app).toContain('map.removeControl(previous)');
    expect(app).not.toContain('className="network-attribution"');
    expect(app).toContain('networkNotice && <div className="map-source-notice"');
    expect(app).toContain('className="network-notice"');
  });

  it("keeps the global stylesheet within the visual debt budget", () => {
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const report = analyzeVisualSystem(css);

    expect(() => assertVisualSystemBudget(report)).not.toThrow();
    expect(report.requiredTokensMissing).toEqual([]);
    expect(report.hardcodedColorsOutsideRoot).toBeLessThanOrEqual(393);
  });

  it("keeps map colors centralized in the shared map theme", () => {
    expect(AIRRADAR_MAP_THEME.accent).toBe("#43d8c2");
    expect(AIRRADAR_MAP_THEME.selected).toBe("#f5bd62");
    expect(AIRRADAR_MAP_THEME.weather).toBe("#66b9ff");

    const timeMachine = readFileSync(
      new URL("../components/time-machine.tsx", import.meta.url),
      "utf8",
    );
    expect(timeMachine).toContain("AIRRADAR_MAP_THEME");
    expect(timeMachine.match(/#[0-9a-fA-F]{6}\b/g) ?? []).toEqual([]);
  });

  it("keeps radar labels above the dark tint and enforces the typography floor", () => {
    const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    const mapStyle = readFileSync(new URL("../lib/map-style.ts", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

    expect(app).toContain("firstBasemapSymbolLayerId");
    expect(app).toContain("applyAirRadarBasemapReadability(map)");
    expect(mapStyle).toContain("AIRRADAR_MAP_THEME.basemap.placeLabel");
    expect(mapStyle).toContain("AIRRADAR_MAP_THEME.basemap.airportLabel");
    expect(mapStyle).toContain("AIRRADAR_MAP_THEME.basemap.boundary");
    expect(css).not.toMatch(/font-size:\s*[789]px\s*;/);

    for (const relativePath of [
      "../app/radar-aircraft-panel.css",
      "../components/radar/radar-flight-follow-hud.module.css",
      "../components/radar/radar-operational-focus-card.module.css",
      "../components/radar/radar-operational-focus-summary.module.css",
      "../components/radar/radar-operations-center.module.css",
    ]) {
      const radarCss = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(radarCss).not.toMatch(/font-size:\s*[789]px\s*;/);
    }
  });

  it("keeps the radar source breakdown behind a keyboard-accessible disclosure", () => {
    const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const quickDetailCss = readFileSync(new URL("../app/radar-aircraft-panel.css", import.meta.url), "utf8");

    expect(app).toContain('<details className="source-counter-details">');
    expect(app).toContain('className="source-counter-strip" aria-label={t.radar.trafficSourceLabel}');
    expect(app).toContain("<summary aria-label={t.radar.trafficSourceLabel}");
    expect(css).toContain(".source-counter-details:not([open]) > .source-counter-strip");
    expect(css).toContain(".map-summary-card:has(.source-counter-details[open])");
    expect(quickDetailCss).toContain("font-size: clamp(12px, 1vw, 14px);");
  });

  it("uses existing Czech and English translations for traffic-hero metrics", () => {
    const markup = renderToStaticMarkup(createElement(RadarTrafficHero, {
      sourceLabel: "ADS-B",
      primaryLabel: "OK-TEST",
      altitude: "1 000 ft",
      speed: "250 kt",
      track: "90°",
      verticalRate: "+100 ft/min",
    }));

    for (const label of [
      t.aircraft.altitude,
      t.layers.colorModes.speed,
      t.aircraft.track,
    ]) {
      expect(markup).toContain("<span>" + label + "</span>");
    }
    expect(markup).toContain('title="' + t.aircraft.groundSpeed + '"');
    expect(markup).toContain('title="' + t.aircraft.verticalRate + '"');
    expect(markup).toContain('aria-label="' + t.aircraft.verticalRate + '"');
    expect(markup).toContain(">V/S</span>");
    expect(markup).toContain('aria-label="' + t.aircraft.liveTrackingTitle + '"');
  });

  it("exposes the shared visual primitives used by feature pages", () => {
    const primitives = readFileSync(
      new URL("../components/ui-primitives.tsx", import.meta.url),
      "utf8",
    );

    for (const exportedPrimitive of [
      "Card",
      "SectionHeader",
      "MetricCard",
      "Button",
      "SegmentedControl",
      "EmptyState",
      "StatusBadge",
    ]) {
      expect(primitives).toContain(`export function ${exportedPrimitive}`);
    }
  });
});
