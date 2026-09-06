import { describe, expect, it } from "vitest";
import type { StateSnapshot } from "@/lib/aircraft/types";
import { toPublicStateSnapshot } from "@/lib/server/public-serialization";
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
