import { describe, expect, it } from "vitest";
import type { AircraftWeatherObservation } from "@/lib/server/aircraft-weather";
import type { AircraftWindContext } from "@/lib/weather/aircraft-wind-context";
import type { AircraftSigmetContext } from "@/lib/weather/aircraft-sigmet-context";
import { buildWeatherFusion } from "@/lib/weather/fusion";
import type { MetarMapObservation, PirepObservation } from "@/lib/weather/types";

const now = new Date("2026-10-05T05:00:00Z");

function observation(overrides: Partial<AircraftWeatherObservation> = {}): AircraftWeatherObservation {
  return {
    aircraftHex: "ABC123",
    flightId: null,
    callsign: "TEST123",
    observedAt: new Date("2026-10-05T04:58:00Z"),
    receivedAt: new Date("2026-10-05T04:58:01Z"),
    lat: 49.2,
    lon: 17.7,
    altitudeFt: 30000,
    altitudeType: "BAROMETRIC",
    windDirectionDeg: 270,
    windSpeedKt: 55,
    staticAirTemperatureC: -42,
    totalAirTemperatureC: null,
    staticPressureHpa: null,
    humidityPct: null,
    turbulenceLevel: 2,
    source: "BDS_4_4",
    provider: "local",
    quality: "HIGH",
    weatherSourceQuality: "GNSS",
    bdsConfidence: "HIGH",
    provenance: {},
    ...overrides,
  };
}

function pirep(overrides: Partial<PirepObservation> = {}): PirepObservation {
  return {
    id: "P1",
    reportType: "PIREP",
    urgent: false,
    observedAt: "2026-10-05T04:45:00Z",
    receivedAt: null,
    latitude: 49.25,
    longitude: 17.75,
    altitudeFt: 31000,
    aircraftType: "B738",
    temperatureC: -41,
    windDirectionDeg: 275,
    windSpeedKt: 58,
    turbulence: { intensity: "MOD", type: "CAT", frequency: "OCNL" },
    icing: null,
    weather: null,
    sky: null,
    visibilitySm: null,
    rawText: null,
    ...overrides,
  };
}

function sigmet(overrides: Partial<AircraftSigmetContext> = {}): AircraftSigmetContext {
  return {
    id: "SIG1",
    relation: "current",
    estimatedMinutes: 0,
    distanceNm: 0,
    hazard: "SEV TURB",
    phenomenon: "TURB",
    qualifier: "OBS",
    firName: "LKAA",
    validTo: "2026-10-05T06:00:00Z",
    lowerFt: 25000,
    upperFt: 35000,
    verticalMatch: "matched",
    source: "isigmet",
    ...overrides,
  };
}

function metar(overrides: Partial<MetarMapObservation & { distanceNm: number }> = {}): MetarMapObservation & { distanceNm: number } {
  return {
    stationId: "LKTB",
    lat: 49.15,
    lon: 16.69,
    observedAt: "2026-10-05T04:50:00Z",
    flightCategory: "VFR",
    windDirection: 250,
    windSpeed: 12,
    windGust: 20,
    visibility: 9999,
    ceiling: 2500,
    temperature: 2,
    dewpoint: 1,
    qnh: 1013,
    clouds: [],
    rawMetar: "LKTB 050450Z 25012G20KT 9999 -RA BKN025 02/01 Q1013",
    stale: false,
    distanceNm: 45,
    ...overrides,
  };
}

function modelWind(overrides: Partial<AircraftWindContext> = {}): AircraftWindContext {
  return {
    levelHpa: 300,
    representativeAltitudeFt: 30100,
    model: "ICON-EU",
    validAt: "2026-10-05T05:00:00Z",
    stale: false,
    sourceDistanceKm: 18,
    windSpeedKt: 60,
    windFromDeg: 280,
    headwindKt: 0,
    tailwindKt: 0,
    crosswindKt: 0,
    crosswindFrom: null,
    ...overrides,
  };
}

describe("Aviation Weather Fusion V1", () => {
  it("raises confidence when independent BDS and PIREP evidence agree", () => {
    const result = buildWeatherFusion({
      aircraftHex: "abc123",
      lat: 49.2,
      lon: 17.7,
      altitudeFt: 30000,
      now,
      aircraftObservations: [observation()],
      pireps: [pirep()],
      sigmets: [],
      metar: null,
      modelWind: modelWind(),
    });
    const turbulence = result.risks.find((risk) => risk.kind === "TURBULENCE");
    expect(turbulence).toMatchObject({ severity: "MODERATE", confidence: "HIGH", sourceCount: 2 });
    expect(result.overall).toMatchObject({ severity: "MODERATE", confidence: "HIGH", dominantRisk: "TURBULENCE" });
  });

  it("lets an altitude-relevant turbulence SIGMET dominate weaker reports", () => {
    const result = buildWeatherFusion({
      aircraftHex: "ABC123", lat: 49.2, lon: 17.7, altitudeFt: 30000, now,
      aircraftObservations: [observation({ turbulenceLevel: 1 })],
      pireps: [pirep({ turbulence: { intensity: "LGT", type: null, frequency: null } })],
      sigmets: [sigmet()],
      metar: null,
      modelWind: null,
    });
    expect(result.risks.find((risk) => risk.kind === "TURBULENCE")).toMatchObject({ severity: "HIGH", confidence: "HIGH" });
  });

  it("keeps METAR freezing moisture a low-confidence derived icing signal", () => {
    const result = buildWeatherFusion({
      aircraftHex: "ABC123", lat: 49.2, lon: 17.7, altitudeFt: 3000, now,
      aircraftObservations: [], pireps: [], sigmets: [], metar: metar(), modelWind: null,
    });
    expect(result.risks.find((risk) => risk.kind === "ICING")).toMatchObject({ severity: "LOW", confidence: "LOW" });
    expect(result.evidence.find((item) => item.code === "METAR_FREEZING_MOISTURE")).toMatchObject({ source: "METAR", severity: "LOW" });
  });

  it("detects convective evidence from METAR and SIGMET independently", () => {
    const result = buildWeatherFusion({
      aircraftHex: "ABC123", lat: 49.2, lon: 17.7, altitudeFt: 15000, now,
      aircraftObservations: [], pireps: [],
      sigmets: [sigmet({ id: "TS1", hazard: "EMBD TS", phenomenon: "TS" })],
      metar: metar({ rawMetar: "LKTB 050450Z 25012KT 6000 TSRA BKN025CB 12/10 Q1010", temperature: 12 }),
      modelWind: null,
    });
    expect(result.risks.find((risk) => risk.kind === "CONVECTION")).toMatchObject({ severity: "HIGH", confidence: "HIGH", sourceCount: 2 });
  });

  it("compares observed aircraft wind with ICON-EU without converting disagreement into a hazard", () => {
    const result = buildWeatherFusion({
      aircraftHex: "ABC123", lat: 49.2, lon: 17.7, altitudeFt: 30000, now,
      aircraftObservations: [observation({ windDirectionDeg: 270, windSpeedKt: 55, turbulenceLevel: null })],
      pireps: [], sigmets: [], metar: null, modelWind: modelWind({ windFromDeg: 278, windSpeedKt: 62 }),
    });
    expect(result.wind).toMatchObject({ status: "AGREE", confidence: "HIGH", speedDeltaKt: 7, directionDeltaDeg: 8 });
    expect(result.overall.severity).toBe("UNKNOWN");
  });

  it("fails closed instead of claiming clear weather when only one risk is cleared", () => {
    const result = buildWeatherFusion({
      aircraftHex: "ABC123", lat: 49.2, lon: 17.7, altitudeFt: 30000, now,
      aircraftObservations: [observation({ turbulenceLevel: 0, windDirectionDeg: null, windSpeedKt: null })],
      pireps: [], sigmets: [], metar: null, modelWind: null,
    });
    expect(result.risks.find((risk) => risk.kind === "TURBULENCE")?.severity).toBe("NONE");
    expect(result.risks.find((risk) => risk.kind === "ICING")?.severity).toBe("UNKNOWN");
    expect(result.overall.severity).toBe("UNKNOWN");
  });

  it("drops PIREP evidence that is too far away vertically", () => {
    const result = buildWeatherFusion({
      aircraftHex: "ABC123", lat: 49.2, lon: 17.7, altitudeFt: 30000, now,
      aircraftObservations: [],
      pireps: [pirep({ altitudeFt: 10000, turbulence: { intensity: "SEV", type: null, frequency: null } })],
      sigmets: [], metar: null, modelWind: null,
    });
    expect(result.evidence).toEqual([]);
  });
});
