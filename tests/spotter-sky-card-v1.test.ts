import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { buildSpotterSkyStory, verticalTrend } from "@/lib/spotter-story";

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
  messages: 100,
  seenSeconds: 0,
  seenPosSeconds: 0,
  lastSeen: "2026-10-07T13:00:00Z",
  source: "ADS-B",
  origin: "local",
  sourceType: null,
  onGround: false,
  distanceKm: 10,
  bearing: 250,
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
    flightPlan: {
      callsign: "UAE139",
      scheduledDeparture: null,
      actualDeparture: null,
      scheduledArrival: null,
      estimatedArrival: "2026-10-07T13:08:00Z",
      filedRoute: null,
      waypoints: [],
    },
  },
} satisfies AircraftView;

describe("Spotter Sky Card V1", () => {
  it("combines canonical live enrichment into one story", () => {
    const story = buildSpotterSkyStory(
      aircraft,
      { score: 80, reasons: [{ code: "iconic_type", points: 30 }] },
      {
        secondsUntilClosest: 38,
        currentHorizontalDistanceKm: 3,
        closestHorizontalDistanceKm: 1.2,
        closestSlantDistanceKm: 3.2,
        elevationAtClosestDeg: 61,
        phase: "approaching",
      },
    );
    expect(story).toMatchObject({
      identity: "UAE139",
      registration: "A6-EVK",
      aircraftType: "A388",
      operator: "Emirates",
      origin: "DXB",
      destination: "PRG",
      estimatedArrival: "2026-10-07T13:08:00Z",
      closestApproachKm: 1.2,
      secondsUntilClosest: 38,
    });
  });

  it("classifies vertical trend conservatively", () => {
    expect(verticalTrend(-1200)).toBe("descending");
    expect(verticalTrend(800)).toBe("climbing");
    expect(verticalTrend(100)).toBe("level");
    expect(verticalTrend(null)).toBe("unknown");
  });
});
