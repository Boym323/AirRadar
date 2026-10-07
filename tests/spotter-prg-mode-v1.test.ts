import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";
import { buildPrgSpottingMode } from "@/lib/spotter-prg-mode";

function aircraft(id: string, destination: string, eta: string | null, lon = 14.2): AircraftView {
  return {
    icaoHex: id,
    callsign: id,
    registration: null,
    aircraftType: "A320",
    aircraftDescription: null,
    lat: 50.05,
    lon,
    altitude: 6000,
    baroAltitude: 6000,
    geomAltitude: null,
    groundSpeed: 210,
    track: 250,
    verticalRate: -900,
    baroRate: -900,
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
    distanceKm: 10,
    bearing: 250,
    enrichment: {
      route: {
        callsign: id,
        airline: null,
        airlineIcao: null,
        airlineIata: null,
        origin: "EDDF",
        destination,
        originAirport: null,
        destinationAirport: null,
      },
      flightPlan: {
        callsign: id,
        scheduledDeparture: null,
        actualDeparture: null,
        scheduledArrival: eta,
        estimatedArrival: eta,
        filedRoute: null,
        waypoints: [],
      },
    },
  };
}

const operations = {
  airport: { icaoCode: "LKPR", name: "Prague" },
  generatedAt: "2026-10-07T15:00:00Z",
  window: "24h",
  provenance: "INFERRED",
  complete: true,
  truncated: false,
  activity: "MODERATE",
  likelyRunway: { designator: "24", confidence: "high", sampleCount: 8 },
  arrivals: [],
  departures: [],
  approaches: [],
  recentMovements: [],
  runwayUsage: [],
  wind: [],
  goArounds: [],
  holding: [],
  diagnostics: {},
} as unknown as AirportOperationsResponse;

const observer = {
  lat: 50,
  lon: 14,
  altitudeMeters: 300,
  accuracyMeters: 5,
  capturedAt: "2026-10-07T15:00:00Z",
};

describe("PRG Spotting Mode V1", () => {
  it("keeps only confirmed PRG/LKPR inbound traffic and preserves canonical runway context", () => {
    const context = buildPrgSpottingMode([
      aircraft("PRG001", "PRG", "2026-10-07T15:08:00Z"),
      aircraft("VIE001", "VIE", "2026-10-07T15:05:00Z"),
      aircraft("PRG002", "LKPR", "2026-10-07T15:12:00Z", 14.3),
    ], { latitude: 50.1008, longitude: 14.26 }, operations, observer, new Date("2026-10-07T15:00:00Z"));

    expect(context.likelyRunway).toBe("24");
    expect(context.activity).toBe("MODERATE");
    expect(context.inboundCount).toBe(2);
    expect(context.nextArrivals.map((item) => item.icaoHex)).toEqual(["PRG001", "PRG002"]);
    expect(context.nextEtaAt).toBe("2026-10-07T15:08:00.000Z");
  });

  it("classifies the local inbound queue conservatively", () => {
    expect(buildPrgSpottingMode([], { latitude: 50.1, longitude: 14.26 }, operations, observer).queueState).toBe("EMPTY");
    expect(buildPrgSpottingMode([
      aircraft("A00001", "PRG", null),
      aircraft("A00002", "PRG", null),
    ], { latitude: 50.1, longitude: 14.26 }, operations, observer).queueState).toBe("LIGHT");
    expect(buildPrgSpottingMode(Array.from({ length: 5 }, (_, index) =>
      aircraft("A" + String(index).padStart(5, "0"), "PRG", null)
    ), { latitude: 50.1, longitude: 14.26 }, operations, observer).queueState).toBe("BUSY");
  });

  it("adds observer view-angle context without uploading observer coordinates", () => {
    const context = buildPrgSpottingMode([
      aircraft("PRG001", "PRG", "2026-10-07T15:08:00Z"),
    ], { latitude: 50.1008, longitude: 14.26 }, operations, observer, new Date("2026-10-07T15:00:00Z"));
    expect(context.nextArrivals[0]?.observerElevationDeg).not.toBeNull();
    expect(["GOOD", "LOW"]).toContain(context.nextArrivals[0]?.viewAngle);
  });
});
