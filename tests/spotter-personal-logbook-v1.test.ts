import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import {
  SPOTTER_LOGBOOK_MAX_ENTRIES,
  addSpotterLogbookEntry,
  createSpotterLogbookEntry,
  parseSpotterLogbook,
  serializeSpotterLogbook,
  spotterLogbookStats,
} from "@/lib/spotter-logbook";
import { buildSpotterSkyStory } from "@/lib/spotter-story";

const aircraft = {
  icaoHex: "8964A1",
  callsign: "UAE139",
  registration: "A6-EVK",
  aircraftType: "A388",
  aircraftDescription: "Airbus A380-800",
  lat: 50,
  lon: 14,
  altitude: 9000,
  baroAltitude: 9000,
  geomAltitude: null,
  groundSpeed: 220,
  track: 280,
  verticalRate: -1000,
  baroRate: -1000,
  geomRate: null,
  squawk: "1000",
  category: null,
  emergency: null,
  rssi: null,
  messages: 1,
  seenSeconds: 0,
  seenPosSeconds: 0,
  lastSeen: "2026-10-07T13:00:00Z",
  source: "ADS-B",
  origin: "local",
  sourceType: null,
  onGround: false,
  distanceKm: null,
  bearing: null,
  enrichment: {
    metadata: {
      registration: "A6-EVK",
      registrationCountry: "United Arab Emirates",
      registrationCountryCode: "AE",
      aircraftType: "Airbus A380-800",
      icaoTypeCode: "A388",
      aircraftDescription: "Airbus A380-800",
      operator: "Emirates",
      manufacturer: "Airbus",
      year: "2019",
    },
    route: {
      callsign: "UAE139",
      airline: "Emirates",
      airlineIcao: "UAE",
      airlineIata: "EK",
      origin: "DXB",
      destination: "PRG",
      originAirport: null,
      destinationAirport: null,
    },
  },
} satisfies AircraftView;

const story = buildSpotterSkyStory(
  aircraft,
  { score: 80, reasons: [{ code: "iconic_type", points: 30 }] },
  {
    secondsUntilClosest: 45,
    currentHorizontalDistanceKm: 5,
    closestHorizontalDistanceKm: 1.4,
    closestSlantDistanceKm: 3,
    elevationAtClosestDeg: 60,
    phase: "approaching",
  },
);

describe("Spotter Personal Logbook V1", () => {
  it("creates and round-trips a bounded browser-local sighting", () => {
    const entry = createSpotterLogbookEntry(aircraft, story, "2026-10-07T13:05:20Z");
    const state = addSpotterLogbookEntry({ version: 1, entries: [] }, entry);
    expect(parseSpotterLogbook(serializeSpotterLogbook(state))).toEqual(state);
    expect(entry).toMatchObject({
      icaoHex: "8964A1",
      callsign: "UAE139",
      registration: "A6-EVK",
      aircraftType: "A388",
      operator: "Emirates",
      origin: "DXB",
      destination: "PRG",
      closestDistanceKm: 1.4,
      interestScore: 80,
    });
  });

  it("deduplicates repeat clicks in the same minute", () => {
    const entry = createSpotterLogbookEntry(aircraft, story, "2026-10-07T13:05:20Z");
    const once = addSpotterLogbookEntry({ version: 1, entries: [] }, entry);
    const twice = addSpotterLogbookEntry(once, entry);
    expect(twice.entries).toHaveLength(1);
  });

  it("summarizes personal sightings and caps storage", () => {
    let state = { version: 1 as const, entries: [] };
    for (let i = 0; i < SPOTTER_LOGBOOK_MAX_ENTRIES + 5; i += 1) {
      state = addSpotterLogbookEntry(state, {
        ...createSpotterLogbookEntry(aircraft, story, new Date(Date.UTC(2026, 9, 7, 13, i)).toISOString()),
        id: "id-" + i,
        icaoHex: "HEX" + i,
      });
    }
    expect(state.entries).toHaveLength(SPOTTER_LOGBOOK_MAX_ENTRIES);
    expect(spotterLogbookStats(state).sightings).toBe(SPOTTER_LOGBOOK_MAX_ENTRIES);
  });

  it("fails closed for corrupt storage", () => {
    expect(parseSpotterLogbook("not-json")).toEqual({ version: 1, entries: [] });
  });
});
