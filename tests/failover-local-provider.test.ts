import { describe, expect, it } from "vitest";
import { mergeLocalAircraft } from "@/lib/server/failover-local-provider";
import { normalizeAircraft } from "@/lib/aircraft/normalize";

const receiver = { lat: 50, lon: 14, name: "Test" };

describe("local Beast/readsb JSON merge", () => {
  it("fills a Beast velocity-only observation from readsb's aggregated state", () => {
    const json = normalizeAircraft({
      hex: "3c0936", flight: "SDR78JA", type: "adsb_icao", lat: 49.14, lon: 17.55,
      alt_baro: 34000, alt_geom: 35325, gs: 409.4, track: 315.49, baro_rate: 0,
      geom_rate: 0, ias: 274, tas: 460, mach: 0.788, nav_qnh: 1013.6,
      nav_altitude_mcp: 34016, version: 2, nic: 8, rc: 186, nac_p: 9, nac_v: 1,
      sil: 3, sil_type: "perhour", seen: 0.4, seen_pos: 0.374,
    }, receiver, new Date("2026-09-27T12:00:00Z"))!;
    const beast = {
      ...json,
      altitude: null,
      baroAltitude: null,
      geomAltitude: null,
      groundSpeed: 409,
      track: 315,
      verticalRate: 0,
      baroRate: 0,
      geomRate: null,
      sourceType: "df17",
      adsbTelemetry: null,
    };

    const merged = mergeLocalAircraft(beast, json);

    expect(merged).toMatchObject({
      icaoHex: "3C0936",
      altitude: 34000,
      baroAltitude: 34000,
      geomAltitude: 35325,
      groundSpeed: 409,
      track: 315,
      sourceType: "df17",
      adsbTelemetry: {
        iasKt: 274,
        selectedAltitudeMcpFt: 34016,
        navQnhHpa: 1013.6,
      },
    });
  });
});
