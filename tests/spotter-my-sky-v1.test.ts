import { describe, expect, it } from "vitest";
import { haversineDistanceKm, initialBearingDeg, normalizeBearing, observerGeometry } from "@/lib/spotter-location";

const observer = {
  lat: 50,
  lon: 14,
  altitudeMeters: 300,
  accuracyMeters: 5,
  capturedAt: "2026-10-07T12:00:00Z",
};

describe("Spotter My Sky V1 geometry", () => {
  it("normalizes bearings and computes cardinal direction", () => {
    expect(normalizeBearing(-10)).toBe(350);
    expect(initialBearingDeg(observer, { lat: 51, lon: 14 })).toBeCloseTo(0, 5);
    expect(initialBearingDeg(observer, { lat: 50, lon: 15 })).toBeCloseTo(89.6, 1);
  });

  it("computes observer distance independently of receiver distance", () => {
    const distance = haversineDistanceKm(observer, { lat: 50.01, lon: 14 });
    expect(distance).toBeGreaterThan(1);
    expect(distance).toBeLessThan(1.2);
  });

  it("derives optional slant distance and elevation without exposing observer coordinates", () => {
    const geometry = observerGeometry({ lat: 50.01, lon: 14, altitude: 10_000 }, observer);
    expect(geometry).not.toBeNull();
    expect(geometry!.horizontalDistanceKm).toBeGreaterThan(1);
    expect(geometry!.slantDistanceKm).toBeGreaterThan(geometry!.horizontalDistanceKm);
    expect(geometry!.elevationDeg).toBeGreaterThan(0);
    expect(geometry).not.toHaveProperty("lat");
    expect(geometry).not.toHaveProperty("lon");
  });

  it("fails closed when an aircraft has no usable position", () => {
    expect(observerGeometry({ lat: null, lon: 14, altitude: 5000 }, observer)).toBeNull();
    expect(observerGeometry({ lat: 50, lon: null, altitude: 5000 }, observer)).toBeNull();
  });
});
