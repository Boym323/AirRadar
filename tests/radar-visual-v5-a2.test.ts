import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("Visual System V5-A2 map and topbar hierarchy", () => {
  const app = file("components/airradar-app.tsx");
  const css = file("app/globals.css");
  it("does not render redundant topbar source metrics or a duplicate filter count", () => {
    expect(app).not.toContain('className="topbar-metric"');
    expect(app).not.toContain('className="topbar-metric topbar-metric-network"');
    expect(app).not.toContain('className="map-summary-filter-state"');
    expect(app).toContain('className="source-counter-details"');
    expect(app).toContain('data-testid="radar-map-hud"');
  });
  it("keeps the traffic control accessible on a 320px mobile screen", () => {
    expect(app).toContain('aria-label={t.radar.trafficNearby} data-testid="traffic-trigger"');
    expect(css).toContain('.map-overlay-primary .map-summary-card { display: none; }');
    expect(css).toContain('.map-overlay-primary .traffic-trigger-label { display: none; }');
    expect(css).toContain('max-width: calc(100vw - 76px)');
    expect(css).toContain('max-width: calc(100vw - 76px);');
  });
});
