import { describe, expect, it } from "vitest";
import { lightGeometry, solarPosition } from "@/lib/spotter-sun-geometry";

describe("Spotter Sun & Light Geometry V1", () => {
  it("places the equinox midday sun high over the equator", () => {
    const sun = solarPosition(new Date("2026-03-20T12:00:00Z"), { lat: 0, lon: 0 });
    expect(sun.elevationDeg).toBeGreaterThan(85);
    expect(sun.period).toBe("DAY");
  });

  it("distinguishes front, side and back light by azimuth difference", () => {
    const sun = { azimuthDeg: 180, elevationDeg: 25, period: "DAY" as const };
    expect(lightGeometry(sun, 0).lighting).toBe("FRONT");
    expect(lightGeometry(sun, 90).lighting).toBe("SIDE");
    expect(lightGeometry(sun, 180).lighting).toBe("BACK");
  });

  it("classifies golden hour, twilight and night from solar elevation", () => {
    expect(solarPosition(new Date("2026-06-21T12:00:00Z"), { lat: 50, lon: 14 }).period).toBe("DAY");
    const twilight = lightGeometry({ azimuthDeg: 250, elevationDeg: -3, period: "TWILIGHT" }, 180);
    expect(twilight.lighting).toBe("UNAVAILABLE");
  });

  it("normalizes observer-facing bearings", () => {
    const result = lightGeometry({ azimuthDeg: 350, elevationDeg: 15, period: "DAY" }, -10);
    expect(result.aircraftBearingDeg).toBe(350);
    expect(result.azimuthDifferenceDeg).toBe(0);
    expect(result.lighting).toBe("BACK");
  });
});
