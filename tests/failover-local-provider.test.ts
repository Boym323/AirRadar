import { describe, expect, it } from "vitest";
import { mergeLocalAircraft } from "@/lib/server/failover-local-provider";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { Aircraft } from "@/lib/aircraft/types";

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

  it("prefers fresh JSON telemetry over stale Beast telemetry", () => {
    const json = normalizeAircraft({
      hex: "3c0936", flight: "SDR78JA", lat: 49.14, lon: 17.55, ias: 280, mach: 0.8, seen: 0,
    }, receiver, new Date("2026-09-27T12:00:30Z"))!;
    const beast = {
      ...json,
      lastSeen: "2026-09-27T11:59:00.000Z",
      adsbTelemetry: { ...json.adsbTelemetry!, iasKt: 200, mach: null },
      observationTimes: {
        altitude: null, baroAltitude: null, geomAltitude: null, groundSpeed: null, track: null, verticalRate: null,
        extendedTelemetry: Date.parse("2026-09-27T11:59:00.000Z"),
      },
      provenance: {
        ...json.provenance!,
        fields: {
          ...json.provenance?.fields,
          iasKt: { origin: "local", protocol: "beast-mode-s", bds: "BDS6,0", observedAt: "2026-09-27T11:59:00.000Z", confidence: "medium" },
        },
      },
    } satisfies Aircraft;
    const merged = mergeLocalAircraft(beast, json);
    expect(merged.adsbTelemetry?.iasKt).toBe(280);
    expect(merged.provenance?.fields?.iasKt?.protocol).toBe("readsb-json");
  });

  it("uses field-level freshness so one fresh BDS value does not refresh stale telemetry", () => {
    const json = normalizeAircraft({
      hex: "3c0936", flight: "SDR78JA", lat: 49.14, lon: 17.55,
      ias: 280, ws: 35, seen: 0,
    }, receiver, new Date("2026-09-27T12:01:00Z"))!;
    const beast = {
      ...json,
      adsbTelemetry: {
        ...json.adsbTelemetry!,
        iasKt: 200,
        windSpeedKt: 55,
        staticPressureHpa: 1002,
      },
      observationTimes: {
        altitude: null, baroAltitude: null, geomAltitude: null, groundSpeed: null, track: null, verticalRate: null,
        extendedTelemetry: Date.parse("2026-09-27T12:00:55.000Z"),
      },
      provenance: {
        ...json.provenance!,
        fields: {
          iasKt: { origin: "local", protocol: "beast-mode-s", bds: "BDS6,0", observedAt: "2026-09-27T11:59:30.000Z", confidence: "medium" },
          windSpeedKt: { origin: "local", protocol: "beast-mode-s", bds: "BDS4,4", observedAt: "2026-09-27T12:00:55.000Z", confidence: "medium" },
          staticPressureHpa: { origin: "local", protocol: "beast-mode-s", bds: "BDS4,4", observedAt: "2026-09-27T12:00:55.000Z", confidence: "medium" },
        },
      },
    } satisfies Aircraft;

    const merged = mergeLocalAircraft(beast, json);
    expect(merged.adsbTelemetry?.iasKt).toBe(280);
    expect(merged.adsbTelemetry?.windSpeedKt).toBe(55);
    expect(merged.adsbTelemetry?.staticPressureHpa).toBe(1002);
    expect(merged.provenance?.fields?.iasKt?.protocol).toBe("readsb-json");
    expect(merged.provenance?.fields?.windSpeedKt?.bds).toBe("BDS4,4");
  });

  it("drops stale Beast target state instead of presenting it as current", () => {
    const json = normalizeAircraft({
      hex: "3c0936", flight: "SDR78JA", lat: 49.14, lon: 17.55, seen: 0,
    }, receiver, new Date("2026-09-27T12:01:00Z"))!;
    const beast = {
      ...json,
      lastSeen: "2026-09-27T12:01:00.000Z",
      targetState: {
        subtype: 1,
        selectedAltitudeFt: 20000,
        selectedAltitudeSource: "MCP/FCU",
        baroPressureHpa: 1013.6,
        selectedHeadingDeg: 90,
        nacp: 9,
        nicBaro: 1,
        sil: 3,
        modeStatus: true,
        autopilot: true,
        vnavMode: true,
        altitudeHoldMode: true,
        approachMode: false,
        lnavMode: true,
        tcasOperational: true,
      },
      observationTimes: { extendedTelemetry: Date.parse("2026-09-27T11:59:00.000Z") },
    } as Aircraft;

    expect(mergeLocalAircraft(beast, json).targetState).toBeNull();
  });

  it("does not let an implausible Beast altitude replace a nearby JSON altitude", () => {
    const json = normalizeAircraft({ hex: "3c0936", lat: 49.14, lon: 17.55, alt_baro: 41000, seen: 0 }, receiver, new Date("2026-09-27T12:00:30Z"))!;
    const beast = { ...json, altitude: 82600, baroAltitude: 82600, geomAltitude: null, sourceType: "df4", observationTimes: { ...json.observationTimes, altitude: Date.parse("2026-09-27T12:00:30Z") } } as Aircraft;
    expect(mergeLocalAircraft(beast, json).altitude).toBe(41000);
  });
});
