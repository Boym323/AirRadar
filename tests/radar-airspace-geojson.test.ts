import { describe, expect, it } from "vitest";
import { createAtcGeoJSON, createNavigationIntegrityGeoJSON } from "@/lib/radar/airspace-geojson";
import type { AtcSector } from "@/lib/atc/types";
import type { AirspaceActivityResponse } from "@/lib/airspace-activity/types";

describe("radar airspace map GeoJSON parity", () => {
  const sector = {
    id: "LKTRA36", name: "LKTRA36", country: "CZ",
    polygons: [
      [[14, 50], [15, 50], [15, 51]],
      [[200, 50], [201, 50], [201, 51]],
      [[14, 50], [15, 50]],
    ],
    lowerAltitudeFt: 2000, upperAltitudeFt: 15000,
    frequencies: [{ frequencyMhz: 123.45, isPrimary: true }, { frequencyMhz: 124.5, isPrimary: false }],
    source: "test", activationStatus: "ACTIVE",
  } as unknown as AtcSector;

  it("returns the previous empty contract without touching hidden planned activity", () => {
    const activity = new Proxy({} as AirspaceActivityResponse, {
      get() { throw new Error("hidden ATC must not index airspace windows"); },
    });
    expect(createAtcGeoJSON([sector], false, activity)).toEqual({
      type: "FeatureCollection", features: [],
    });
  });

  it("preserves visible published ATC geometry and metadata", () => {
    const result = createAtcGeoJSON([sector], true);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({
      type: "Feature",
      properties: {
        id: "LKTRA36", countryCode: "CZ", name: "LKTRA36",
        label: "LKTRA36", airspacePlanState: "none",
        activationStatus: "ACTIVE",
      },
      geometry: { type: "Polygon", coordinates: [[[14, 50], [15, 50], [15, 51]]] },
    });
  });

  it("formats shared sector properties once for multiple polygons without changing output", () => {
    const polygon: AtcSector["polygons"][number] = [[14, 50], [15, 50], [15, 51]];
    let frequencyReads = 0;
    const repeatedSector = { ...sector, polygons: [polygon, polygon, polygon] };
    Object.defineProperty(repeatedSector, "frequencies", {
      get() {
        frequencyReads += 1;
        return [{ frequencyMhz: 123.45, isPrimary: true }, { frequencyMhz: 124.5, isPrimary: false }];
      },
    });
    const result = createAtcGeoJSON([repeatedSector], true);
    expect(result.features).toHaveLength(3);
    expect(frequencyReads).toBe(1);
    const first = result.features[0]?.properties;
    for (const feature of result.features) {
      expect(feature.properties).toEqual(first);
      expect(feature.properties).toMatchObject({ id: "LKTRA36" });
      expect(feature.properties).not.toHaveProperty("trafficAircraftCount");
      expect(feature.properties).not.toHaveProperty("trafficLevel");
    }
  });

  it("preserves non-NORMAL Navigation Integrity cells and 0.2-degree geometry", () => {
    const result = createNavigationIntegrityGeoJSON([
      { latCell: 250, lonCell: 72, state: "NORMAL", affectedAircraftCount: 0 },
      { latCell: 251, lonCell: 73, state: "WATCH", affectedAircraftCount: 3 },
    ]);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties).toEqual({ state: "WATCH", affectedAircraftCount: 3 });
    const lon = 73 * 0.2;
    const lat = 251 * 0.2;
    expect(result.features[0].geometry).toEqual({ type: "Polygon", coordinates: [[[lon, lat], [lon + 0.2, lat], [lon + 0.2, lat + 0.2], [lon, lat + 0.2], [lon, lat]]] });
  });
});
