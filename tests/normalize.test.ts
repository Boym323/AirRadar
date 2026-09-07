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
    expect(normalizeAircraftResponse({ aircraft: [{ hex: "not-an-address", flight: "NOHEX" }] }, { lat: 50, lon: 14, name: "Test" })).toEqual([]);
  });

  it("keeps readsb source and independent barometric/geometric fields", () => {
    const result = normalizeAircraftResponse({ aircraft: [{
      hex: "~abc123", type: "mode_s", flight: "MODE123 ", lat: "50.1", lon: "14.1",
      alt_baro: "ground", alt_geom: 120, baro_rate: -128, geom_rate: 256,
      seen: 2.5, seen_pos: 0.75, category: "A3", mlat: [], tisb: [],
    }] }, { lat: 50, lon: 14, name: "Test" }, new Date("2026-01-01T00:00:00Z"));
    expect(result[0]).toMatchObject({
      icaoHex: "~ABC123", callsign: "MODE123", altitude: 120, baroAltitude: null, geomAltitude: 120,
      verticalRate: -128, baroRate: -128, geomRate: 256, category: "A3",
      seenSeconds: 2.5, seenPosSeconds: 0.75, source: "Mode-S", sourceType: "mode_s", onGround: true,
    });
    expect(result[0].lastSeen).toBe("2025-12-31T23:59:57.500Z");
  });

  it("uses barometric altitude and rate for the general ATC/display values", () => {
    const result = normalizeAircraftResponse({ aircraft: [{
      hex: "abc123", flight: "ALT123", lat: 50, lon: 14,
      alt_baro: 28000, alt_geom: 28600, baro_rate: -512, geom_rate: -256,
    }] }, { lat: 50, lon: 14, name: "Test" });
    expect(result[0]).toMatchObject({
      altitude: 28000, baroAltitude: 28000, geomAltitude: 28600,
      verticalRate: -512, baroRate: -512, geomRate: -256,
    });
  });
});
