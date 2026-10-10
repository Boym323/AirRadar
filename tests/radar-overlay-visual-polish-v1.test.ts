import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("Radar overlay visual polish", () => {
  const app = read("components/airradar-app.tsx");
  const presets = read("components/radar/radar-preset-menu.tsx");
  const layers = read("components/radar/radar-map-layer-menu.tsx");
  const mapStyles = read("app/globals.css");
  const presetStyles = read("components/radar/radar-preset-menu.module.css");
  const followStyles = read("components/radar/radar-flight-follow-hud.module.css");
  const drawerStyles = read("app/radar-aircraft-panel.css");

  it("keeps Presets and Layers in one native, mutually exclusive details group", () => {
    expect(presets).toContain('name="radar-map-menus"');
    expect(layers).toContain('name="radar-map-menus"');
    expect(app).toContain('details[name="radar-map-menus"][open]');
    expect(app).toContain('document.addEventListener("pointerdown", onPointerDown)');
    expect(app).toContain('document.addEventListener("keydown", onKeyDown)');
    expect(app).toContain('document.removeEventListener("pointerdown", onPointerDown)');
    expect(app).toContain('document.removeEventListener("keydown", onKeyDown)');
    expect(app).toContain('menu.open = false');
    expect(app).toContain('event.key !== "Escape"');
    expect(app).toContain('summary")?.focus()');
  });

  it("keeps the compact follow strip in normal map HUD flow", () => {
    expect(app).toContain('compact={drawerState === "aircraft"}');
    expect(followStyles).toMatch(/\.hud\.compact\s*\{\s*position:\s*relative/);
    expect(followStyles).toContain('top: auto;');
    expect(followStyles).toContain('transform: none;');
    expect(followStyles).toContain('max-width: 100%;');
  });

  it("shows all six drawer actions without horizontal clipping on desktop", () => {
    expect(drawerStyles).toContain('.sidebar.drawer-aircraft .aircraft-quick-header .aircraft-v5-quick-actions');
    expect(drawerStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(drawerStyles).toContain('overflow: visible;');
    expect(drawerStyles).toContain('white-space: normal;');
    expect(drawerStyles).toContain('min-height: var(--control-height-touch);');
    expect(drawerStyles).toContain('@media (min-width: 821px)');
  });

  it("bounds scrollable map menus and retains 320px responsiveness", () => {
    expect(mapStyles).toContain('.map-overlay-primary .map-layers-menu');
    expect(mapStyles).toContain('max-height: min(52svh, 480px)');
    expect(presetStyles).toContain('max-height: min(65svh, 520px)');
    expect(presetStyles).toContain('overflow-y: auto');
    expect(mapStyles).toContain('max-height: min(48svh, 430px)');
    expect(presets).not.toContain("fetch(");
    expect(layers).not.toContain("getPrisma(");
  });
});
