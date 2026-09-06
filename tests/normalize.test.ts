import { describe, expect, it } from "vitest";
import { normalizeAircraftResponse } from "@/lib/aircraft/normalize";

describe("readsb normalization", () => {
  it("normalizes common aircraft.json fields and derives distance", () => {
    const result = normalizeAircraftResponse({ aircraft: [{ hex: "abc123", flight: " TEST123 ", r: "OK-ABC", t: "B738", lat: 50.2, lon: 14.5, alt_baro: 12000, gs: 210, track: 90, rssi: -8.5, seen: 1, type: "adsb" }] }, { lat: 50, lon: 14, name: "Test" }, new Date("2026-01-01T00:00:00Z"));
    expect(result).toHaveLength(1);
    expect(result[0].icaoHex).toBe("ABC123");
    expect(result[0].callsign).toBe("TEST123");
    expect(result[0].registration).toBe("OK-ABC");
    expect(result[0].altitude).toBe(12000);
    expect(result[0].source).toBe("ADS-B");
    expect(result[0].distanceKm).toBeGreaterThan(30);
  });

  it("ignores malformed entries without an ICAO hex", () => {
    expect(normalizeAircraftResponse({ aircraft: [{ flight: "NOHEX" }] }, { lat: 50, lon: 14, name: "Test" })).toEqual([]);
  });
});
