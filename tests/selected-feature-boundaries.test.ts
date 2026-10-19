import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const matrix = JSON.parse(readFileSync(new URL("../docs/audits/SELECTED-FEATURE-MATRIX-2026-10-19.json", import.meta.url), "utf8")) as {
  keepIds: string[]; removeIds: string[];
  phase1: { removedStandalonePages: string[]; remainingRoutes: string[] };
};
const root = new URL("../", import.meta.url);

function pagePath(route: string): string {
  return `app${route.replace(/:([^/]+)/g, "[$1]")}/page.tsx`;
}

describe("explicit selected-feature reduction contracts", () => {
  it("keeps the selection unambiguous and prevents ID overlap", () => {
    const selected = [...matrix.keepIds, ...matrix.removeIds];
    expect(new Set(selected).size).toBe(selected.length);
    expect(matrix.keepIds).toContain("R17");
    expect(matrix.keepIds).toContain("J09");
    expect(matrix.keepIds).toContain("L11");
    expect(matrix.keepIds).toContain("L12");
    expect(matrix.removeIds).toContain("D23");
    expect(matrix.removeIds).toContain("P15");
  });

  it("does not ship the first-phase retired page entrypoints", () => {
    for (const route of matrix.phase1.removedStandalonePages) {
      expect(existsSync(new URL(pagePath(route), root)), route).toBe(false);
    }
  });

  it("preserves page entrypoints for user-selected UI", () => {
    for (const route of matrix.phase1.remainingRoutes) {
      expect(existsSync(new URL(pagePath(route), root)), route).toBe(true);
    }
  });

  it("keeps retained airport details free of retired Airport Live Board controllers", () => {
    const detail = readFileSync(new URL("components/airport-detail.tsx", root), "utf8");
    const catalog = readFileSync(new URL("components/airports-flights-browser.tsx", root), "utf8");
    const hud = readFileSync(new URL("components/radar/radar-map-hud.tsx", root), "utf8");
    expect(detail).not.toContain("useAirportLiveTrafficController");
    expect(detail).not.toContain("useAirportOperationsController");
    expect(detail).toContain("<AirportWeatherPanel");
    expect(detail).toContain("<AirportInfrastructureSections");
    expect(catalog).not.toContain("LiveAirportNetwork");
    expect(catalog).not.toContain("FlightsPage");
    expect(hud).not.toContain("RadarOperationsCenter");
  });

  it("does not expose removed navigation targets in main menus", () => {
    const shell = readFileSync(new URL("components/airradar-shell.tsx", root), "utf8");
    const palette = readFileSync(new URL("components/command-palette.tsx", root), "utf8");
    for (const route of matrix.phase1.removedStandalonePages) {
      if (route.includes(":")) continue;
      expect(shell.includes(`href="${route}"`) || shell.includes(`href: "${route}"`), route).toBe(false);
      expect(palette.includes(`href: "${route}"`), route).toBe(false);
    }
  });
});
