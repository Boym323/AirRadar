import { describe, expect, it } from "vitest";
import type { StateSnapshot } from "@/lib/aircraft/types";
import { toPublicLiveStateSnapshot, toPublicStateSnapshot } from "@/lib/server/public-serialization";
import { toPublicHealthResponse } from "@/lib/server/public-health";

function snapshot(): StateSnapshot {
  return {
    aircraft: [{
      icaoHex: "ABC123", callsign: "TEST123", registration: null, aircraftType: null, aircraftDescription: null,
      lat: 50.123456, lon: 14.654321, altitude: 30000, baroAltitude: 30000, geomAltitude: null,
      groundSpeed: 400, track: 90, verticalRate: 0, baroRate: 0, geomRate: null, squawk: null,
      category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0,
      lastSeen: "2026-09-06T12:00:00.000Z", source: "ADS-B", sourceType: "adsb_icao", onGround: false,
      distanceKm: 15.25, bearing: 123.4, trail: [],
      enrichment: {
        metadata: {
          registration: null, registrationCountry: null, registrationCountryCode: null,
          aircraftType: null, icaoTypeCode: "A320", aircraftDescription: "Airbus A320",
          operator: "Test Air", manufacturer: "Airbus", source: "test", retrievedAt: "2026-09-06T12:00:00.000Z",
          flags: "test", year: "2020",
        },
        route: {
          callsign: "TEST123", airline: "Test Air", airlineIcao: "TST", airlineIata: "TS",
          origin: null, destination: null, originAirport: null, destinationAirport: null,
          source: "test", retrievedAt: "2026-09-06T12:00:00.000Z",
        },
        flightPlan: {
          callsign: "TEST123", scheduledDeparture: null, actualDeparture: null,
          scheduledArrival: null, estimatedArrival: null, filedRoute: "LONG ROUTE",
          waypoints: ["A", "B"], source: "test", retrievedAt: "2026-09-06T12:00:00.000Z",
        },
      },
    }],
    relevantAtcFrequencies: [{
      frequencyMhz: 127.35,
      service: "ACC",
      callsign: "PRAHA RADAR",
      airspaceType: null,
      sector: "Praha",
      aircraftCount: 1,
      confidence: { level: "high", positionInside: 1, positionBoundary: 0, altitudeMatched: 1, altitudeUnknown: 0 },
      source: "AIP ČR",
      aircraftLabels: ["TEST123"],
      additionalAircraftCount: 0,
    }],
    receiver: { lat: 50.123456, lon: 14.654321, name: "Test receiver" },
    fetchedAt: "2026-09-06T12:00:00.000Z",
    provider: "readsb",
    sourceOnline: false,
    lastSourceUpdate: null,
    sourceError: "connect ECONNREFUSED 192.168.1.50:8080",
    readsbOnline: false,
    lastReadsbUpdate: null,
    lastError: "postgresql://user:password@db.internal/airradar",
    stats: { currentAircraft: 1, aircraftSeenToday: 1, uniqueAircraftToday: 1, maxConcurrentAircraft: 1, maxDistanceKm: 15.25, aircraftTypes: [], airlines: [], messagesPerSecond: null },
  };
}

describe("public snapshot serialization", () => {
  it("publishes exact coordinates only in exact mode", () => {
    expect(toPublicStateSnapshot(snapshot(), "exact").receiver).toEqual({ lat: 50.123456, lon: 14.654321, name: "Test receiver" });
  });

  it("rounds coordinates deterministically in approximate mode", () => {
    const value = toPublicStateSnapshot(snapshot(), "approximate");
    expect(value.receiver).toEqual({ lat: 50.12, lon: 14.65, name: "Test receiver" });
    expect(value.aircraft[0]).toMatchObject({ lat: 50.123456, lon: 14.654321, distanceKm: 15.25, bearing: 123.4 });
  });

  it("hides coordinates without changing aircraft calculations", () => {
    const internal = snapshot();
    const value = toPublicStateSnapshot(internal, "hidden");
    expect(value.receiver).toEqual({ lat: null, lon: null, name: "Test receiver" });
    expect(value.aircraft[0]).toMatchObject({ distanceKm: 15.25, bearing: 123.4 });
    expect(internal.receiver).toEqual({ lat: 50.123456, lon: 14.654321, name: "Test receiver" });
  });

  it("uses the same safe transformation shape for repeated API/SSE serialization", () => {
    expect(toPublicStateSnapshot(snapshot(), "hidden")).toEqual(toPublicStateSnapshot(snapshot(), "hidden"));
  });

  it("publishes only the public relevant-frequency summary, not internal sector data", () => {
    const value = toPublicStateSnapshot(snapshot(), "hidden");
    expect(value.relevantAtcFrequencies[0]).toMatchObject({ frequencyMhz: 127.35, callsign: "PRAHA RADAR", aircraftCount: 1 });
    expect(JSON.stringify(value.relevantAtcFrequencies)).not.toContain("sectorId");
    expect(JSON.stringify(value.relevantAtcFrequencies)).not.toContain("polygon");
  });

  it("keeps full metadata and flight plans out of the live feed", () => {
    const value = toPublicLiveStateSnapshot(snapshot(), "hidden");
    expect(value.aircraft[0].enrichment).toEqual({
      route: snapshot().aircraft[0].enrichment?.route,
    });
    expect(JSON.stringify(value)).not.toContain("LONG ROUTE");
    expect(JSON.stringify(value)).not.toContain("Airbus A320");
  });
});

describe("public health serialization", () => {
  it("does not expose raw provider errors or configuration details", () => {
    const response = toPublicHealthResponse(snapshot(), { status: "offline" }, "2026-09-06T12:00:00.000Z");
    const serialized = JSON.stringify(response);
    expect(response.database).toEqual({ status: "offline", message: "Database unavailable" });
    expect(response.source.error).toBe("Receiver unavailable");
    expect(serialized).not.toContain("ECONNREFUSED");
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("192.168.1.50");
  });
});
