import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Visual System V5-A1 radar quick actions", () => {
  const app = file("components/airradar-app.tsx");
  const actions = file("components/radar/radar-quick-actions.tsx");
  const css = file("app/globals.css");

  it("reuses existing radar actions and state without adding data fetches", () => {
    expect(app).toContain("<RadarQuickActions");
    expect(app).toContain('onOpenFilters={() => openTrafficDrawer("filters")}');
    expect(app).toContain("onToggleAtc={() => setShowAtc((current) => !current)}");
    expect(app).toContain("setShowWeatherRadar(enabled)");
    expect(actions).toContain("requestCommandPaletteOpen");
    expect(actions).not.toMatch(/fetch\(|setInterval\(/);
  });

  it("exposes pressed/disabled state and preserves selected aircraft map space", () => {
    expect(actions).toContain("aria-pressed={weatherEnabled}");
    expect(actions).toContain("aria-pressed={atcEnabled}");
    expect(actions).toContain("disabled={filtersDisabled}");
    expect(actions).toContain('data-selection-open={selectionOpen ? "true" : "false"}');
    expect(css).toContain('.radar-quick-actions[data-selection-open="true"] { display: none; }');
    expect(css).toContain("min-height: var(--control-height-touch);");
  });

  it("localizes every action in Czech and English", () => {
    for (const locale of ["cs", "en"]) {
      const strings = file(`lib/i18n/${locale}.ts`);
      for (const key of ["title:", "search:", "weather:", "atc:", "filters:", "activeFilters:"])
        expect(strings.slice(strings.indexOf("radarQuickActions: {"))).toContain(key);
    }
  });
});
