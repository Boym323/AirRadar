import { describe, expect, it } from "vitest";
import type { MetarMapObservation } from "@/lib/weather/types";
import { evaluateVisualAcquisition, nearestMetarObservation } from "@/lib/spotter-visual-acquisition";

const observer = {
  lat: 50.0,
  lon: 14.0,
  altitudeMeters: 300,
  accuracyMeters: 5,
  capturedAt: "2026-10-07T14:00:00Z",
};

function metar(stationId: string, lat: number, lon: number, visibility = 10_000, ceiling = 8_000): MetarMapObservation {
  return {
    stationId,
    lat,
    lon,
    observedAt: "2026-10-07T14:00:00Z",
    flightCategory: "VFR",
    windDirection: 250,
    windSpeed: 8,
    windGust: null,
    visibility,
    ceiling,
    temperature: 15,
    dewpoint: 8,
    qnh: 1015,
    clouds: [],
    rawMetar: null,
    stale: false,
  };
}

describe("Spotter Visual Acquisition V1", () => {
  it("selects the nearest regional METAR in the browser", () => {
    const nearest = nearestMetarObservation([
      metar("LKPR", 50.1008, 14.26),
      metar("LKKB", 50.1214, 14.5436),
    ], observer);
    expect(nearest?.observation.stationId).toBe("LKPR");
    expect(nearest?.distanceKm).toBeLessThan(30);
  });

  it("rates a high-elevation pass in good visibility as GOOD", () => {
    const result = evaluateVisualAcquisition({
      lat: 50.01,
      lon: 14.0,
      altitude: 5_000,
    }, observer, {
      observation: metar("LKPR", 50.1, 14.2, 10_000, 8_000),
      distanceKm: 20,
    });
    expect(result.status).toBe("GOOD");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).toContain("HIGH_ELEVATION");
    expect(result.reasons).toContain("GOOD_VISIBILITY");
    expect(result.aircraftAboveCeiling).toBe(false);
  });

  it("downgrades poor visibility and an aircraft above a low ceiling", () => {
    const result = evaluateVisualAcquisition({
      lat: 50.03,
      lon: 14.0,
      altitude: 12_000,
    }, observer, {
      observation: metar("LKPR", 50.1, 14.2, 2_000, 2_000),
      distanceKm: 20,
    });
    expect(result.status).toBe("POOR");
    expect(result.reasons).toContain("POOR_VISIBILITY");
    expect(result.reasons).toContain("ABOVE_CEILING");
    expect(result.aircraftAboveCeiling).toBe(true);
  });

  it("keeps weather absence explicit instead of assuming clear conditions", () => {
    const result = evaluateVisualAcquisition({
      lat: 50.01,
      lon: 14.0,
      altitude: 5_000,
    }, observer, null);
    expect(result.reasons).toContain("WEATHER_UNAVAILABLE");
    expect(result.visibilityMeters).toBeNull();
    expect(result.weatherStationId).toBeNull();
  });
});
