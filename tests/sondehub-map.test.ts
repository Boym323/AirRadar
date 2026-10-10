import { describe, expect, it } from "vitest";
import { sondeFeatures } from "../components/radar/use-sondehub-map-layer";

describe("SondeHub isolated map overlay", () => {
  it("uses independent points with longitude-latitude coordinates", () => {
    const result = sondeFeatures([{
      serial: "S123", model: "RS41", lat: 49.2, lon: 17.7, altitudeM: 12000,
      observedAt: "2026-10-10T19:00:00Z", verticalSpeedMs: 5, temperatureC: null, frequencyMhz: null,
    }]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].geometry.coordinates).toEqual([17.7, 49.2]);
    expect(result.features[0].properties).toMatchObject({ serial: "S123", model: "RS41" });
    expect(JSON.stringify(result)).not.toContain("icaoHex");
  });
});
