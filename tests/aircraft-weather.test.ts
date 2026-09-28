import { describe, expect, it, beforeEach } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import {
  aggregateAircraftWeatherProfile,
  AIRCRAFT_WEATHER_PERSISTENCE_POLICY,
  circularWindDirectionDelta,
  decideWeatherPersistence,
  evictAircraftWeatherAccumulators,
  getAircraftWeatherDiagnostics,
  observationFromAircraft,
  observationFromStoredWeatherRow,
  resetAircraftWeatherDiagnostics,
  shouldPersistWeatherObservation,
  weatherObservationFingerprint,
  type AircraftWeatherObservation,
  weatherQueryFetchLimit,
} from "@/lib/server/aircraft-weather";
import { buildAircraftWeatherQualityReport } from "@/lib/server/aircraft-weather-quality";

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

  it("keeps diagnostics on the process-global state shared by route bundles", () => {
    observationFromAircraft(aircraft(), at);
    const globalState = (globalThis as unknown as { aircraftWeatherDiagnostics?: ReturnType<typeof getAircraftWeatherDiagnostics> }).aircraftWeatherDiagnostics;
    expect(globalState?.weatherCandidates).toBe(1);
    expect(getAircraftWeatherDiagnostics().weatherCandidates).toBe(1);
  });

  it("maps persisted SAT/TAT columns back to the public observation names", () => {
    const { staticAirTemperatureC, totalAirTemperatureC, ...base } = row();
    const result = observationFromStoredWeatherRow({
      ...base,
      staticAirTempC: staticAirTemperatureC,
      totalAirTempC: totalAirTemperatureC,
      provenanceJson: JSON.stringify({}),
    });
    expect(result).toMatchObject({ staticAirTemperatureC: -40, totalAirTemperatureC: -30 });
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

  it("normalizes circular wind changes across north", () => {
    expect(circularWindDirectionDelta(359, 4)).toBe(5);
    expect(circularWindDirectionDelta(355, 5)).toBe(10);
  });

  it("fetches a bounded spatial candidate set before applying radius filtering", () => {
    expect(weatherQueryFetchLimit({ from: at, to: new Date(at.getTime() + 60_000), lat: 49, lon: 17, radiusKm: 80 }, 5, 0)).toBe(20_000);
    expect(weatherQueryFetchLimit({ from: at, to: new Date(at.getTime() + 60_000) }, 5, 0)).toBe(6);
  });

  it("coalesces stable READSB weather but preserves heartbeat, altitude, and weather triggers", () => {
    const previous = row({ source: "READSB_JSON", quality: "GOOD" });
    const accumulator = {
      lastSeenAt: at.getTime(),
      lastPersisted: previous,
      lastPersistedAt: at.getTime(),
      lastPersistedFingerprint: weatherObservationFingerprint(previous),
    };
    expect(decideWeatherPersistence({ ...previous, observedAt: new Date(at.getTime() + 30_000) }, accumulator)).toBeNull();
    expect(decideWeatherPersistence({ ...previous, observedAt: new Date(at.getTime() + AIRCRAFT_WEATHER_PERSISTENCE_POLICY.readsb.heartbeatMs) }, accumulator)).toBe("HEARTBEAT");
    expect(decideWeatherPersistence({ ...previous, altitudeFt: 11_000, observedAt: new Date(at.getTime() + 5_000) }, accumulator)).toBe("ALTITUDE_BIN_CHANGE");
    expect(decideWeatherPersistence({ ...previous, staticAirTemperatureC: -42, observedAt: new Date(at.getTime() + 5_000) }, accumulator)).toBe("WEATHER_CHANGE");
    expect(decideWeatherPersistence({ ...previous, quality: "HIGH", observedAt: new Date(at.getTime() + 5_000) }, accumulator)).toBe("QUALITY_CHANGE");
  });

  it("keeps unique BDS 4,4 observations outside the exact duplicate window", () => {
    const previous = row({ source: "BDS_4_4", quality: "HIGH" });
    const accumulator = {
      lastSeenAt: at.getTime(),
      lastPersisted: previous,
      lastPersistedAt: at.getTime(),
      lastPersistedFingerprint: weatherObservationFingerprint(previous),
    };
    expect(decideWeatherPersistence({ ...previous, observedAt: new Date(at.getTime() + 1_000) }, accumulator)).toBeNull();
    expect(decideWeatherPersistence({ ...previous, windSpeedKt: 45, observedAt: new Date(at.getTime() + 1_000) }, accumulator)).toBe("BDS44_UNIQUE");
    expect(decideWeatherPersistence({ ...previous, observedAt: new Date(at.getTime() + 20_000) }, accumulator)).toBe("BDS44_UNIQUE");
  });

  it("evicts inactive accumulator entries and exposes bounded diagnostics", () => {
    observationFromAircraft(aircraft(), at);
    expect(getAircraftWeatherDiagnostics().weatherAccumulatorEntries).toBe(1);
    expect(evictAircraftWeatherAccumulators(at.getTime() + AIRCRAFT_WEATHER_PERSISTENCE_POLICY.accumulator.ttlMs + 1)).toBe(1);
    expect(getAircraftWeatherDiagnostics().weatherAccumulatorEntries).toBe(0);
  });

  it("builds bounded quality coverage without exposing rejected rows", () => {
    const report = buildAircraftWeatherQualityReport([
      row({ source: "READSB_JSON", quality: "HIGH", humidityPct: 20 }),
      row({ aircraftHex: "DEF456", source: "BDS_4_4", quality: "GOOD", staticAirTemperatureC: null, totalAirTemperatureC: null, staticPressureHpa: null, humidityPct: null, turbulenceLevel: null, altitudeFt: 35_000 }),
    ], new Date("2026-09-28T09:01:00.000Z"));
    expect(report.bounded.maxRows).toBe(20_000);
    expect(report.persisted.contributingAircraft).toBe(2);
    expect(report.sourceCoverage.BDS_4_4).toMatchObject({ observations: 1, aircraft: 1 });
    expect(report.fieldCoverage.sat).toBe(1);
    expect(report.altitudeBands.FL300_FL400).toBe(1);
    expect(report.quality).toEqual({ HIGH: 1, GOOD: 1 });
  });
});
