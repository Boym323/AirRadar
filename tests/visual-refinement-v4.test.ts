import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("Visual System V4 readability and hierarchy", () => {
  const globalCss = file("app/globals.css");
  const drawerCss = file("app/radar-aircraft-panel.css");
  const map = file("lib/map-style.ts");

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

});
