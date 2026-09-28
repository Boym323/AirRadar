import { describe, expect, it, beforeEach } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  aggregateAircraftWeatherProfile,
  observationFromAircraft,
  resetAircraftWeatherDiagnostics,
  shouldPersistWeatherObservation,
  type AircraftWeatherObservation,
} from "@/lib/server/aircraft-weather";

const at = new Date("2026-09-28T09:00:00.000Z");
function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  const timestamp = at.toISOString();
  return {
    icaoHex: "ABC123", callsign: "TEST", registration: null, aircraftType: null, aircraftDescription: null,
    lat: 50, lon: 14, altitude: 10_000, baroAltitude: 10_000, geomAltitude: null, groundSpeed: 250, track: 90,
    verticalRate: 0, baroRate: 0, geomRate: null, squawk: null, category: null, emergency: null, rssi: null,
    messages: 1, seenSeconds: 0, seenPosSeconds: 0, lastSeen: timestamp, source: "ADS-B", origin: "local",
    sourceType: "adsb", onGround: false, distanceKm: 1, bearing: 0, trail: [],
    adsbTelemetry: { iasKt: null, tasKt: 400, mach: null, windDirectionDeg: 350, windSpeedKt: 40, outsideAirTemperatureC: -40, totalAirTemperatureC: -30, staticPressureHpa: null, navQnhHpa: 1013, selectedAltitudeMcpFt: null, selectedAltitudeFmsFt: null, selectedHeadingDeg: null, navModes: [], nic: null, containmentRadiusM: null, nacP: null, nacV: null, sil: null, silType: null, gva: null, sda: null, adsbVersion: null, alert: null, spi: null, dbFlags: null },
    provenance: { seenLocal: true, seenNetwork: false, lastLocalSeen: timestamp, lastNetworkSeen: null, positionOrigin: "local", positionSource: "ADS-B", fields: {
      windDirectionDeg: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      windSpeedKt: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      outsideAirTemperatureC: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
      totalAirTemperatureC: { origin: "local", protocol: "readsb-json", observedAt: timestamp, confidence: "high" },
    } },
    observationTimes: { altitude: at.getTime(), baroAltitude: at.getTime(), geomAltitude: null, groundSpeed: at.getTime(), track: at.getTime(), verticalRate: at.getTime(), position: at.getTime(), extendedTelemetry: at.getTime(), signal: at.getTime() },
    ...overrides,
  };
}
function row(overrides: Partial<AircraftWeatherObservation> = {}): AircraftWeatherObservation {
  return { aircraftHex: "ABC123", flightId: null, callsign: "TEST", observedAt: at, receivedAt: at, lat: 50, lon: 14, altitudeFt: 10_000, altitudeType: "BAROMETRIC", windDirectionDeg: 350, windSpeedKt: 40, staticAirTemperatureC: -40, totalAirTemperatureC: -30, staticPressureHpa: 250, humidityPct: null, turbulenceLevel: null, source: "READSB_JSON", provider: "readsb", quality: "GOOD", weatherSourceQuality: null, bdsConfidence: null, provenance: {}, ...overrides };
}

describe("aircraft weather observations", () => {
  beforeEach(() => resetAircraftWeatherDiagnostics());

  it("keeps readsb telemetry as READSB_JSON and preserves static/total temperature", () => {
    const result = observationFromAircraft(aircraft(), at);
    expect(result).toMatchObject({ source: "READSB_JSON", staticAirTemperatureC: -40, totalAirTemperatureC: -30 });
    expect(result?.staticPressureHpa).toBeNull();
  });

  it("rejects a stale location/weather pairing", () => {
    const value = aircraft({ observationTimes: { altitude: at.getTime(), baroAltitude: at.getTime(), geomAltitude: null, groundSpeed: at.getTime(), track: at.getTime(), verticalRate: at.getTime(), position: at.getTime() - 11_000, extendedTelemetry: at.getTime(), signal: at.getTime() } });
    expect(observationFromAircraft(value, at)).toBeNull();
  });

  it("samples the first observation and suppresses an immediate duplicate", () => {
    const first = row();
    expect(shouldPersistWeatherObservation(first, undefined)).toBe(true);
    expect(shouldPersistWeatherObservation({ ...first, observedAt: new Date(at.getTime() + 1_000) }, first)).toBe(false);
    expect(shouldPersistWeatherObservation({ ...first, observedAt: new Date(at.getTime() + 20_000) }, first)).toBe(true);
  });

  it("uses per-aircraft medians and vector-averages 350° + 10° near north", () => {
    const profile = aggregateAircraftWeatherProfile([
      row({ aircraftHex: "A", windDirectionDeg: 350, staticAirTemperatureC: -40 }),
      row({ aircraftHex: "A", observedAt: new Date(at.getTime() + 1_000), windDirectionDeg: 10, staticAirTemperatureC: -42 }),
      row({ aircraftHex: "B", windDirectionDeg: 0, staticAirTemperatureC: -41 }),
    ], { lat: 50, lon: 14, radiusKm: 30, from: new Date(at.getTime() - 1_000), to: new Date(at.getTime() + 2_000), binSizeFt: 2_000, now: at });
    expect(profile.bins).toHaveLength(1);
    expect(profile.bins[0]?.windDirectionDeg).toBeCloseTo(0, 5);
    expect(profile.bins[0]?.temperatureC).toBeCloseTo(-41, 5);
    expect(profile.bins[0]?.aircraftCount).toBe(2);
  });

  it("weights wind vectors by aircraft rather than by sample count", () => {
    const profile = aggregateAircraftWeatherProfile([
      row({ aircraftHex: "A", windDirectionDeg: 90 }),
      row({ aircraftHex: "A", observedAt: new Date(at.getTime() + 1_000), windDirectionDeg: 90 }),
      row({ aircraftHex: "B", windDirectionDeg: 0 }),
    ], { lat: 50, lon: 14, radiusKm: 30, from: new Date(at.getTime() - 1_000), to: new Date(at.getTime() + 2_000), binSizeFt: 2_000, now: at });
    expect(profile.bins[0]?.windDirectionDeg).toBeCloseTo(45, 5);
  });
});
