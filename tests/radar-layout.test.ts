import { describe, expect, it } from "vitest";
import { radarBottomControlOffset, radarCameraPadding, type RadarLayoutRect } from "@/lib/radar/layout";

function rect(left: number, top: number, right: number, bottom: number): RadarLayoutRect {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

describe("radar responsive layout geometry", () => {
  it("keeps desktop camera content clear of the right drawer", () => {
    const padding = radarCameraPadding({
      mapRect: rect(0, 60, 1440, 900),
      drawerRect: rect(1040, 60, 1440, 900),
      bottomNavRect: null,
      mobile: false,
    });

    expect(padding).toEqual({ top: 70, right: 420, bottom: 40, left: 40 });
  });

  it("uses the actual selected mobile sheet height instead of a fixed percentage", () => {
    const padding = radarCameraPadding({
      mapRect: rect(0, 58, 390, 844),
      drawerRect: rect(6, 310, 384, 778),
      bottomNavRect: rect(0, 780, 390, 844),
      mobile: true,
    });

    expect(padding.bottom).toBe(554);
    expect(padding.right).toBe(40);
  });

  it("keeps map-only mobile camera above the bottom navigation", () => {
    const padding = radarCameraPadding({
      mapRect: rect(0, 58, 390, 844),
      drawerRect: null,
      bottomNavRect: rect(0, 780, 390, 844),
      mobile: true,
    });

    expect(padding.bottom).toBe(84);
  });

  it("derives MapLibre control offset from the actual visible obstruction", () => {
    expect(radarBottomControlOffset({
      mapRect: rect(0, 58, 390, 844),
      drawerRect: rect(6, 610, 384, 778),
      bottomNavRect: rect(0, 780, 390, 844),
      mobile: true,
    })).toBe(244);

    expect(radarBottomControlOffset({
      mapRect: rect(0, 58, 390, 844),
      drawerRect: null,
      bottomNavRect: rect(0, 780, 390, 844),
      mobile: true,
    })).toBe(74);
  });
});
