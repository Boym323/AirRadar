import { describe, expect, it } from "vitest";
import { isRadarMapAppearance, lightBasemapPaint, RADAR_SATELLITE_ATTRIBUTION, RADAR_SATELLITE_TILES } from "@/lib/radar/map-appearance";
describe("V6-B basemap appearance", () => {
  it("fails closed on unknown persisted map appearance", () => {
    expect(isRadarMapAppearance("dark")).toBe(true);
    expect(isRadarMapAppearance("light")).toBe(true);
    expect(isRadarMapAppearance("satellite")).toBe(true);
    expect(isRadarMapAppearance("unsafe-provider")).toBe(false);
  });
  it("adjusts only paint properties on native basemap and distinguishes water", () => {
    expect(lightBasemapPaint({ id: "water", type: "fill", paint: { "fill-color": "#000" } })["fill-color"]).toBe("#b7dfe9");
    expect(lightBasemapPaint({ id: "poi", type: "symbol", paint: { "text-color": "#fff" } })["text-color"]).toBe("#334959");
    expect(lightBasemapPaint({ id: "road", type: "line", paint: { "line-width": 2 } })).toEqual({});
  });
  it("uses a documented WMTS source with required satellite attribution", () => {
    expect(RADAR_SATELLITE_TILES).toContain("s2cloudless-2020_3857");
    expect(RADAR_SATELLITE_ATTRIBUTION).toContain("modified Copernicus Sentinel data 2020");
  });
});
