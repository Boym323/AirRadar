import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("../components/airradar-shell.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const weatherCss = readFileSync(new URL("../components/weather-operations-center.module.css", import.meta.url), "utf8");
const productionGate = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");

describe("Visual System V3.4 final polish", () => {
  it("keeps the bottom Radar label short with a full localized accessible name", () => {
    expect(shell).toContain('item("/", "Radar", "radar", t.radar.liveAirPicture)');
    expect(shell).toContain("accessibleLabel = label");
    expect(shell).toContain("aria-label={accessibleLabel}");
    expect(globalCss).toContain("grid-template-columns: repeat(5, minmax(0, 1fr))");
  });

  it("uses a solid surface for the narrow-screen More menu", () => {
    const menu = globalCss.match(/\.mobile-bottom-more > div\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(menu).toContain("background: var(--surface-elevated)");
    expect(menu).toContain("overscroll-behavior: contain");
    expect(menu).not.toContain("var(--surface-overlay)");
    expect(productionGate).toContain("more-menu-mobile-en-320");
  });

  it("keeps weather cards away from viewport edges and above the mobile bottom nav", () => {
    expect(weatherCss).toContain("padding: var(--space-3) var(--space-3) 1.5rem");
    expect(weatherCss).toMatch(/@media \(max-width: 820px\)\s*\{\s*\.page\s*\{\s*padding-bottom:\s*calc\(86px \+ env\(safe-area-inset-bottom\)\)/);
    expect(productionGate).toContain("weather-empty-mobile");
  });
});
