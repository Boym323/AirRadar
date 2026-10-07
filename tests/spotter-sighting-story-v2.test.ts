import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import {
  SPOTTER_LOGBOOK_VERSION,
  createSpotterLogbookEntry,
  parseSpotterLogbook,
  spotterLogbookReplayHref,
} from "@/lib/spotter-logbook";
import type { SpotterSkyStory } from "@/lib/spotter-story";

const aircraft = {
  icaoHex: "8964A1",
  callsign: "UAE139",
  registration: "A6-EVK",
  aircraftType: "A388",
  aircraftDescription: "Airbus A380-800",
  lat: 50,
  lon: 14,
  altitude: 9400,
  baroAltitude: 9400,
  geomAltitude: null,
  groundSpeed: 228,
  track: 280,
  verticalRate: -1200,
  baroRate: -1200,
  geomRate: null,
  squawk: "1000",
  category: null,
  emergency: null,
  rssi: null,
  messages: 1,
  seenSeconds: 0,
  seenPosSeconds: 0,
  lastSeen: "2026-10-07T15:00:00Z",
  source: "ADS-B",
  origin: "local",
  sourceType: null,
  onGround: false,
  distanceKm: 2,
  bearing: 220,
} satisfies AircraftView;

const story: SpotterSkyStory = {
  identity: "UAE139",
  registration: "A6-EVK",
  aircraftType: "A388",
  aircraftDescription: "Airbus A380-800",
  operator: "Emirates",
  manufacturer: "Airbus",
  year: "2019",
  origin: "DXB",
  destination: "PRG",
  originName: null,
  destinationName: null,
  estimatedArrival: "2026-10-07T15:08:00Z",
  altitudeFt: 9400,
  groundSpeedKt: 228,
  verticalRateFpm: -1200,
  closestApproachKm: 1.2,
  secondsUntilClosest: 38,
  elevationAtClosestDeg: 61,
  phase: "approaching",
  interest: { score: 85, reasons: [{ code: "iconic_type", points: 30 }] },
};

describe("Spotter Sighting Story V2", () => {
  it("captures available weather, light and photo context without observer coordinates", () => {
    const entry = createSpotterLogbookEntry(
      aircraft,
      story,
      "2026-10-07T15:05:00Z",
      {
        visual: {
          status: "GOOD",
          score: 90,
          elevationDeg: 61,
          slantDistanceKm: 3,
          horizontalDistanceKm: 1.2,
          visibilityMeters: 10_000,
          ceilingFtAgl: 8_000,
          weatherStationId: "LKPR",
          weatherStationDistanceKm: 20,
          aircraftAboveCeiling: false,
          reasons: ["GOOD_VISIBILITY"],
        },
        light: {
          azimuthDeg: 240,
          elevationDeg: 18,
          period: "DAY",
          aircraftBearingDeg: 180,
          azimuthDifferenceDeg: 60,
          lighting: "SIDE",
        },
        photoOpportunity: {
          score: 92,
          reasons: [{ code: "SIDE_LIGHT", points: 12 }],
        },
      },
    );

    expect(entry).toMatchObject({
      weatherStationId: "LKPR",
      visibilityMeters: 10_000,
      ceilingFtAgl: 8_000,
      lightPeriod: "DAY",
      lighting: "SIDE",
      photoScore: 92,
    });
    expect(entry).not.toHaveProperty("lat");
    expect(entry).not.toHaveProperty("lon");
  });

  it("migrates V1 stored sightings to V2 without deleting them", () => {
    const state = parseSpotterLogbook(JSON.stringify({
      version: 1,
      entries: [{
        id: "8964A1:1",
        observedAt: "2026-10-07T15:05:00Z",
        icaoHex: "8964A1",
        callsign: "UAE139",
        registration: "A6-EVK",
        aircraftType: "A388",
        operator: "Emirates",
        origin: "DXB",
        destination: "PRG",
        closestDistanceKm: 1.2,
        altitudeFt: 9400,
        interestScore: 85,
      }],
    }));
    expect(state.version).toBe(SPOTTER_LOGBOOK_VERSION);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({
      icaoHex: "8964A1",
      photoScore: null,
      weatherStationId: null,
      lightPeriod: null,
    });
  });

  it("builds the canonical ±10-minute Time Machine replay link", () => {
    const entry = createSpotterLogbookEntry(aircraft, story, "2026-10-07T15:05:00Z");
    expect(spotterLogbookReplayHref(entry)).toBe(
      "/time-machine?at=2026-10-07T15%3A05%3A00.000Z&replay=10&hex=8964A1",
    );
  });
});
