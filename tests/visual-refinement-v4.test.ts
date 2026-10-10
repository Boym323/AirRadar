import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("Visual System V4 readability and hierarchy", () => {
  const globalCss = file("app/globals.css");
  const drawerCss = file("app/radar-aircraft-panel.css");
  const board = file("components/airport-operations-board.tsx");
  const map = file("lib/map-style.ts");
  const cs = file("lib/i18n/cs.ts");
  const en = file("lib/i18n/en.ts");

  it("keeps secondary text legible and map controls at touch size", () => {
    for (const token of ["--font-size-2xs: 11px;", "--font-size-xs: 12px;", "--font-size-sm: 12px;", "--font-size-md: 13px;"])
      expect(globalCss).toContain(token);
    expect(globalCss).toContain("--font-size-base: 14px;");
    expect(globalCss).toContain("--control-height-touch: 44px;");
  });

  it("defaults to the compact selected-aircraft glance while preserving expansion", () => {
    expect(drawerCss).toContain("height: min(43svh, 390px)");
    expect(drawerCss).toContain("height: min(80svh, 760px)");
    expect(globalCss).toContain(".sidebar.drawer-aircraft.has-selection:not(.drawer-closed)) .map-summary-card");
    expect(file("components/aircraft-radar-quick-detail.tsx")).toContain("aria-expanded={mobileExpanded}");
  });

  it("retains a subdued map with readable orientation labels", () => {
    expect(map).toContain("3, airport ? 0.58 : 0.50,");
    expect(map).toContain("3, 0.44,");
    expect(map).toContain("AIRRADAR_BASE_MAP_STYLE_URL");
  });

  it("shows current airport flow ahead of collapsible advanced evidence", () => {
    const flow = board.indexOf('data-testid="airport-live-board-flow-pulse"');
    const advanced = board.indexOf('data-testid="airport-live-board-advanced"');
    const live = board.indexOf('data-testid="airport-live-board-active"');
    expect(flow).toBeGreaterThan(0);
    expect(live).toBeGreaterThan(flow);
    expect(advanced).toBeGreaterThan(live);
    expect(board).toContain('<details className="airport-live-advanced"');
    expect(board).toContain("{t.airport.liveBoardAdvancedLabel}");
    for (const id of ["airport-live-board-v6-pressure", "airport-live-board-v7-arrival-sequence", "airport-live-board-v9-terminal-horizon", "airport-d2-runway-evidence", "airport-d3-approach-evidence", "airport-d4-operational-context"])
      expect(board).toContain(`data-testid="${id}"`);
    for (const locale of [cs, en]) {
      expect(locale).toContain("liveBoardAdvancedLabel:");
      expect(locale).toContain("liveBoardAdvancedHint:");
    }
  });
});
