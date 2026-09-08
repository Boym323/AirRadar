import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { getTranslations, visibleAircraft } from "@/lib/i18n";
import {
  DEFAULT_MAP_AIRCRAFT_FILTERS,
  filterAircraftForMap,
  isMapAircraftFilterActive,
  matchesMapAircraftFilters,
  type MapAircraftFilters,
} from "@/lib/aircraft/map-filters";

function aircraft(overrides: Partial<AircraftView> = {}): AircraftView {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: "OK-TEST",
    aircraftType: "A320",
    aircraftDescription: "Airbus A320",
    lat: 50,
    lon: 14,
    altitude: 12_000,
    baroAltitude: 12_000,
    geomAltitude: 12_000,
    groundSpeed: 250,
    track: 90,
    verticalRate: 0,
    baroRate: 0,
    geomRate: 0,
    squawk: "1234",
    category: null,
    emergency: null,
    rssi: null,
    messages: 10,
    seenSeconds: 0,
    seenPosSeconds: 0,
    lastSeen: "2026-09-08T12:00:00.000Z",
    source: "ADS-B",
    sourceType: "adsb_icao",
    onGround: false,
    distanceKm: 20,
    bearing: 90,
    enrichment: {
      metadata: {
        registration: "OK-TEST",
        registrationCountry: "Czech Republic",
        registrationCountryCode: "CZ",
        aircraftType: "Airbus A320",
        icaoTypeCode: "A320",
        aircraftDescription: "Airbus A320-214",
        operator: "Test Air",
        manufacturer: "Airbus",
        source: "test",
        retrievedAt: "2026-09-08T12:00:00.000Z",
      },
    },
    ...overrides,
  };
}

const allFilters = (overrides: Partial<MapAircraftFilters> = {}): MapAircraftFilters => ({
  ...DEFAULT_MAP_AIRCRAFT_FILTERS,
  ...overrides,
});

describe("map aircraft filters", () => {
  const live = aircraft();
  const ground = aircraft({ icaoHex: "DEF456", callsign: null, registration: null, aircraftType: null, altitude: 0, onGround: true, enrichment: undefined });
  const emergency = aircraft({ icaoHex: "FEDCBA", callsign: "RESCUE1", registration: "N-RESC", altitude: 38_000, aircraftType: "B738", emergency: "general", enrichment: { metadata: { ...live.enrichment!.metadata!, icaoTypeCode: "B738", operator: "Rescue Air", registration: "N-RESC" } } });

  it("filters airborne and on-ground aircraft", () => {
    expect(filterAircraftForMap([live, ground], allFilters({ status: "airborne" })).map((item) => item.icaoHex)).toEqual(["ABC123"]);
    expect(filterAircraftForMap([live, ground], allFilters({ status: "onGround" })).map((item) => item.icaoHex)).toEqual(["DEF456"]);
  });

  it("filters minimum and maximum altitude inclusively", () => {
    expect(filterAircraftForMap([live, emergency], allFilters({ minAltitude: "12000", maxAltitude: "38000" }))).toHaveLength(2);
    expect(filterAircraftForMap([live, emergency], allFilters({ minAltitude: "12001" }))).toEqual([emergency]);
    expect(filterAircraftForMap([live, emergency], allFilters({ maxAltitude: "11999" }))).toHaveLength(0);
  });

  it("matches trimmed, case-insensitive identity, type and operator text", () => {
    expect(matchesMapAircraftFilters(live, allFilters({ callsign: "  test1  " }))).toBe(true);
    expect(matchesMapAircraftFilters(live, allFilters({ registration: "ok-te" }))).toBe(true);
    expect(matchesMapAircraftFilters(live, allFilters({ icaoHex: "bc12" }))).toBe(true);
    expect(matchesMapAircraftFilters(live, allFilters({ aircraftType: "a32" }))).toBe(true);
    expect(matchesMapAircraftFilters(live, allFilters({ operator: "TEST AIR" }))).toBe(true);
  });

  it("combines multiple active filters with AND", () => {
    expect(filterAircraftForMap([live, emergency], allFilters({ status: "airborne", minAltitude: "30000", callsign: "RES", emergencyOnly: true }))).toEqual([emergency]);
    expect(filterAircraftForMap([live, emergency], allFilters({ callsign: "RES", operator: "TEST AIR" }))).toHaveLength(0);
  });

  it("does not match missing metadata and supports emergency-only", () => {
    expect(matchesMapAircraftFilters(ground, allFilters({ registration: "OK" }))).toBe(false);
    expect(matchesMapAircraftFilters(ground, allFilters({ aircraftType: "A320" }))).toBe(false);
    expect(filterAircraftForMap([live, emergency], allFilters({ emergencyOnly: true }))).toEqual([emergency]);
  });

  it("reset returns the complete current snapshot and clears active state", () => {
    expect(filterAircraftForMap([live, ground, emergency], DEFAULT_MAP_AIRCRAFT_FILTERS)).toHaveLength(3);
    expect(isMapAircraftFilterActive(DEFAULT_MAP_AIRCRAFT_FILTERS)).toBe(false);
    expect(isMapAircraftFilterActive(allFilters({ icaoHex: "ABC" }))).toBe(true);
  });

  it("formats the visible and total snapshot counts in both locales", () => {
    expect(visibleAircraft(34, 82, getTranslations("cs"))).toBe("34 / 82 letadel");
    expect(visibleAircraft(34, 82, getTranslations("en"))).toBe("34 / 82 aircraft");
  });
});
