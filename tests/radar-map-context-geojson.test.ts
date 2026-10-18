import { describe, expect, it } from "vitest";
import { createAirportGeoJSON, createMetarGeoJSON, createAircraftWeatherGeoJSON } from "@/lib/radar/map-context-geojson";
import type { Airport } from "@/lib/airports/types";
import type { MetarMapObservation } from "@/lib/weather/types";
import type { AircraftWeatherMapObservation } from "@/components/aircraft-weather-panel";

describe("pure radar map source builders", () => {
  it("preserves airport deduplication, geographic validity, exclusions and visibility tiers", () => {
    const airports = [
      { icaoCode: "LKPR", iataCode: "PRG", name: "Praha", latitude: 50.1, longitude: 14.3, type: "large_airport" },
      { icaoCode: "LKPR", iataCode: "PRG", name: "Praha latest", latitude: 50.2, longitude: 14.4, type: "large_airport" },
      { icaoCode: "LKZN", iataCode: null, name: "Zlín", latitude: 49.2, longitude: 17.7, type: "small_airport" },
      { icaoCode: "BAD", iataCode: null, name: "Invalid", latitude: 120, longitude: 10 },
    ] as unknown as Airport[];
    const result = createAirportGeoJSON(airports);
    expect(result.features).toHaveLength(2);
    expect(result.features[0]).toMatchObject({ properties: { icao: "LKPR", tier: "significant" }, geometry: { coordinates: [14.4, 50.2] } });
    expect(result.features[1]).toMatchObject({ properties: { icao: "LKZN", tier: "small" } });
    expect(createAirportGeoJSON(airports, new Set(["LKPR"])).features).toHaveLength(1);
  });

  it("rejects invalid coordinates and retains METAR observation identity", () => {
    const valid = { lat: 49.2, lon: 17.7, icao: "LKTB" } as unknown as MetarMapObservation;
    const invalid = { lat: NaN, lon: 17.7 } as unknown as MetarMapObservation;
    expect(createMetarGeoJSON([valid, invalid]).features).toEqual([
      { type: "Feature", properties: valid, geometry: { type: "Point", coordinates: [17.7, 49.2] } },
    ]);
  });

  it("retains aircraft weather observation identity and selected field", () => {
    const valid = { aircraftHex: "ABC123", observedAt: "2026-10-18T10:00:00.000Z", lat: 49.2, lon: 17.7,
      callsign: "TEST", altitudeFt: 30000, staticAirTemperatureC: -35, windDirectionDeg: 90, windSpeedKt: 50, source: "BDS" } as unknown as AircraftWeatherMapObservation;
    const result = createAircraftWeatherGeoJSON([valid], "wind");
    expect(result.features).toMatchObject([{ properties: { key: "ABC123|2026-10-18T10:00:00.000Z", field: "wind", windSpeedKt: 50 }, geometry: { coordinates: [17.7, 49.2] } }]);
    expect(createAircraftWeatherGeoJSON([], "temperature").features).toEqual([]);
  });
});
