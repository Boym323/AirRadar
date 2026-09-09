import { describe, expect, it } from "vitest";
import { createRangeRingsGeoJSON, RANGE_RING_RADII_KM } from "@/lib/range-rings";

describe("receiver range rings", () => {
  it("creates the five bounded default distance rings", () => {
    const result = createRangeRingsGeoJSON({ lat: 50.1, lon: 14.3, name: "Receiver" });
    expect(RANGE_RING_RADII_KM).toEqual([50, 100, 200, 300, 400]);
    expect(result.features.map((feature) => feature.properties.radiusKm)).toEqual([...RANGE_RING_RADII_KM]);
    expect(result.features.every((feature) => feature.geometry.coordinates.length > 2)).toBe(true);
  });

  it("supports an empty hidden layer without inventing receiver coordinates", () => {
    expect(createRangeRingsGeoJSON({ lat: 50.1, lon: 14.3, name: "Receiver" }, [])).toEqual({ type: "FeatureCollection", features: [] });
  });
});
