import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const selectedContextHook = readFileSync(new URL("../components/radar/use-radar-aircraft-context.ts", import.meta.url), "utf8");
const menu = readFileSync(new URL("../components/radar/radar-map-layer-menu.tsx", import.meta.url), "utf8");
const quick = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");

describe("lightweight radar ATC map boundary", () => {
  it("loads published ATC sectors without retired AUP/UUP polling", () => {
    expect(app).toContain("enabled: showAtc");
    expect(app).not.toContain("/api/airspace/activity");
    expect(app).not.toContain("showAupUup");
    expect(menu).toContain('data-testid="map-layer-atc"');
    expect(menu).not.toContain('data-testid="map-layer-aup-uup"');
  });

  it("keeps live sector-traffic and transition analytics out of the map", () => {
    for (const source of [app, menu]) {
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

  it("memoizes ATC geometry and sends each payload through one MapLibre replay path", () => {
    expect(app).toContain("const atcGeoJson = useMemo(");
    expect(app).toContain("[atcData.sectors, showAtc]");
    expect(app).toContain("const transmitterGeoJson = useMemo<FeatureCollection>");
    expect(app).toContain("[atcData.transmitters, showAtc]");
    expect(app).toContain("mapReplayRef.current.atc.setData(atcGeoJson)");
    expect(app).toContain("mapReplayRef.current.transmitters.setData(transmitterGeoJson)");
    expect(app).not.toContain('(map.getSource("atc-sectors") as GeoJSONSource | undefined)?.setData(');
    expect(app).not.toContain('(map.getSource("atc-transmitters") as GeoJSONSource | undefined)?.setData(');
    expect(app).toContain("for (const replay of Object.values(mapReplays)) replay.setReady(true)");
  });

  it("retains interactive sector geometry and selected-aircraft context", () => {
    expect(app).toContain('map.on("click", "atc-sectors-fill"');
    expect(app).toContain('"atc-sectors-context-highlight"');
    expect(app).toContain('mapRef.current?.getSource("atc-sectors")');
    expect(selectedContextHook).toContain("/context");
    expect(quick).not.toContain("buildAtcHandoffEstimate");
    expect(quick).toContain("t.atc.moreFrequencies");
    expect(selectedContextHook).toContain("30_000");
  });
});
