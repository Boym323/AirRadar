import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import {
  createRegionalAttentionMapFocusGeoJSON,
  emptyRegionalAttentionMapFocusGeoJSON,
  regionalAttentionHorizonForOffset,
} from "@/lib/operational-twin/regional-attention-ui";

function aircraft(icaoHex: string, lat: number | null, lon: number | null): AircraftView {
  return { icaoHex, lat, lon } as AircraftView;
}

describe("Regional Attention UI V1.1", () => {
  it("classifies the bounded 5/15/30 minute horizons", () => {
    expect(regionalAttentionHorizonForOffset(5)).toBe(5);
    expect(regionalAttentionHorizonForOffset(10)).toBe(15);
    expect(regionalAttentionHorizonForOffset(30)).toBe(30);
    expect(regionalAttentionHorizonForOffset(31)).toBeNull();
  });

  it("renders only an explicitly graduated pair with two live positions", () => {
    const geojson = createRegionalAttentionMapFocusGeoJSON({
      graduated: true,
      itemId: "copresence:A:B",
      aircraft: ["A", "B"],
      horizonMinutes: 15,
      projectedDistanceNm: 6.2,
    }, [
      aircraft("A", 49, 17),
      aircraft("B", 49.1, 17.1),
    ]);

    expect(geojson.features).toHaveLength(3);
    expect(geojson.features[0]?.geometry.type).toBe("LineString");
    expect(geojson.features.every((feature) => feature.properties.contextOnly)).toBe(true);
  });

  it("fails closed when focus or current pair positions are unavailable", () => {
    expect(createRegionalAttentionMapFocusGeoJSON(null, [aircraft("A", 49, 17)])).toEqual(
      emptyRegionalAttentionMapFocusGeoJSON(),
    );
    expect(createRegionalAttentionMapFocusGeoJSON({
      graduated: true,
      itemId: "copresence:A:B",
      aircraft: ["A", "B"],
      horizonMinutes: 5,
      projectedDistanceNm: 4,
    }, [aircraft("A", 49, 17), aircraft("B", null, null)])).toEqual(
      emptyRegionalAttentionMapFocusGeoJSON(),
    );
  });
});
