import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../components/radar/use-radar-atc-map-context.ts", import.meta.url), "utf8");
const menu = readFileSync(new URL("../components/radar/radar-map-layer-menu.tsx", import.meta.url), "utf8");
const quick = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");

describe("lightweight radar ATC map boundary", () => {
  it("loads published sectors and planned airspace only when enabled", () => {
    expect(app).toContain("useRadarAtcMapContext");
    expect(app).toContain("enabled: showAtc || showAupUup");
    expect(hook).toContain('url: "/api/airspace/activity"');
    expect(hook).toContain("enabled: showAtc || showAupUup");
    expect(menu).toContain('data-testid="map-layer-atc"');
    expect(menu).toContain('data-testid="map-layer-aup-uup"');
  });

  it("keeps live sector-traffic and transition analytics out of the map", () => {
    for (const source of [app, hook, menu]) {
      expect(source).not.toContain("/api/atc/sectors/traffic");
      expect(source).not.toContain("/api/atc/sectors/transitions");
      expect(source).not.toContain("showAtcTraffic");
      expect(source).not.toContain("SectorFlowsPanel");
      expect(source).not.toContain("AtcVerticalTraffic");
    }
    expect(app).not.toContain('id: "atc-sector-traffic-fill"');
    expect(app).not.toContain('id: "atc-sector-traffic-line"');
    expect(app).not.toContain('id: "atc-sector-traffic-label"');
    expect(quick).not.toContain("sectorTraffic");
  });

  it("retains interactive sector geometry and selected-aircraft context", () => {
    expect(app).toContain('map.on("click", "atc-sectors-fill"');
    expect(app).toContain('"atc-sectors-context-highlight"');
    expect(app).toContain('map.getSource("atc-sectors")');
    expect(app).toContain("/context");
    expect(quick).toContain("buildAtcHandoffEstimate");
    expect(app).toContain("30_000");
  });
});
