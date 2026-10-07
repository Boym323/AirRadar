import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  analyzeVisualSystem,
  assertVisualSystemBudget,
} from "../scripts/visual-system-audit.mjs";
import { AIRRADAR_MAP_THEME } from "../lib/map-theme";

describe("visual system v2", () => {
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
    expect(css).not.toMatch(/font-size:\s*9px;/);
    expect(css).not.toContain("font-size:9px;");

    for (const relativePath of [
      "../app/radar-aircraft-panel.css",
      "../components/radar/radar-flight-follow-hud.module.css",
      "../components/radar/radar-operational-focus-card.module.css",
      "../components/radar/radar-operational-focus-summary.module.css",
      "../components/radar/radar-operations-center.module.css",
    ]) {
      const radarCss = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(radarCss).not.toMatch(/font-size:\s*9px;/);
    }
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
