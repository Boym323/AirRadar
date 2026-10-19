import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIRRADAR_MAP_THEME } from "@/lib/map-theme";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/visual-refactor.css");
const layout = read("app/layout.tsx");
const shell = read("components/airradar-shell.tsx");

const color = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();

describe("2026 shared visual refactor", () => {
  it("loads the shared overrides last without modifying the MapLibre canvas", () => {
    expect(layout.indexOf('import "./visual-refactor.css";')).toBeGreaterThan(
      layout.indexOf('import "./radar-aircraft-panel.css";'),
    );
    expect(css).toContain(".map-overlay-primary");
    expect(css).not.toContain(".maplibregl-canvas");
    expect(css).not.toContain(".maplibregl-ctrl-attrib");
  });

  it("preserves color identity between the UI and map rendering", () => {
    expect(color("accent")).toBe(AIRRADAR_MAP_THEME.accent);
    expect(color("selected")).toBe(AIRRADAR_MAP_THEME.selected);
    expect(color("atc")).toBe(AIRRADAR_MAP_THEME.airspace);
    expect(color("weather")).toBe(AIRRADAR_MAP_THEME.weather);
  });

  it("keeps keyboard navigation and actual route links accessible", () => {
    expect(shell).toContain('className="skip-to-content"');
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain('id="main-content"');
    expect(shell).toContain('className="secondary-page-content"');
    expect(shell).toContain('<Link prefetch={false} className={active ? "active" : ""}');
    expect(css).toContain(".skip-to-content:focus");
    expect(css).toContain(':focus-visible');
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("retains solid and reachable small-screen navigation", () => {
    expect(css).toContain("background: var(--surface-elevated);");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("@media (max-width: 430px)");
    expect(css).toContain("min-height: 52px");
  });
});
