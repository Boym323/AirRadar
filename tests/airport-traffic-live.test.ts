import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { AIRPORT_NEARBY_RADIUS_KM, classifyAirportTraffic, nearbyAirportAircraft } from "@/lib/airport-traffic/live";

function aircraft(overrides: Partial<AircraftView> = {}): AircraftView {
  return {
    icaoHex: "ABC123", callsign: "TEST123", registration: null, aircraftType: "A320", aircraftDescription: null,
    lat: 50.05, lon: 14.40, altitude: 3000, baroAltitude: 3000, geomAltitude: null, groundSpeed: 120,
    track: 90, verticalRate: 0, baroRate: null, geomRate: null, squawk: null, category: null, emergency: null,
    rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: new Date().toISOString(), source: "ADS-B",
    sourceType: null, onGround: false, distanceKm: 1, bearing: null, ...overrides,
  };
}

describe("airport nearby ADS-B traffic", () => {
  it("keeps the radius bounded and excludes missing/stale positions", () => {
    const now = Date.now();
    const items = nearbyAirportAircraft([
      aircraft({ lastSeen: new Date(now).toISOString() }),
      aircraft({ icaoHex: "STALE1", lastSeen: new Date(now - 121_000).toISOString() }),
      aircraft({ icaoHex: "NOPOS1", lat: null, lon: null }),
    ], { latitude: 50.05, longitude: 14.40 }, new Map(), now);
    expect(items).toHaveLength(1);
    expect(items[0].distanceKm).toBeLessThan(AIRPORT_NEARBY_RADIUS_KM);
  });

  it("classifies only when trajectory evidence is sufficient", () => {
    expect(classifyAirportTraffic({ track: 180, verticalRate: 0 }, 10, 180, 12)).toBe("approaching");
    expect(classifyAirportTraffic({ track: 0, verticalRate: 500 }, 12, 180, 10)).toBe("departing");
    expect(classifyAirportTraffic({ track: 90, verticalRate: 0 }, 10, 180, 10.05)).toBe("overflying");
    expect(classifyAirportTraffic({ track: null, verticalRate: null }, 10, 180, 12)).toBe("unknown");
  });
});
