import { describe, expect, it } from "vitest";
import type { TrajectoryConformanceSnapshot } from "@/lib/route-intelligence";
import type { WeatherCorridorIntelligence } from "@/lib/weather/corridor-intelligence";
import { buildWeatherAvoidanceIntelligence } from "@/lib/weather/avoidance-intelligence";
import type { SigmetTrajectoryDeviation } from "@/lib/weather/sigmet-trajectory-deviation";

function deviation(overrides: Partial<SigmetTrajectoryDeviation> = {}): SigmetTrajectoryDeviation {
  return {
    sigmetId: "SIG1",
    hazard: "SEV TURB",
    phenomenon: "TURB",
    firName: "PRAHA FIR",
    previousTrackDeg: 90,
    currentTrackDeg: 25,
    headingChangeDeg: 65,
    lookbackMinutes: 5,
    previousProjectedEntryMinutes: 7,
    previousProjectedEntryDistanceNm: 56,
    confidence: "medium",
    ...overrides,
  };
}

function conformance(overrides: Partial<TrajectoryConformanceSnapshot> = {}): TrajectoryConformanceSnapshot {
  return {
    status: "DEVIATING",
    confidence: "HIGH",
    currentElementId: "E2",
    currentElementSequence: 2,
    deviationStartedAt: Date.parse("2026-10-05T08:00:00Z"),
    rejoinStartedAt: null,
    probableDirect: null,
    evidence: ["CORRIDOR_DEVIATING", "TRACK_DIVERGENCE"],
    reconstructionCoveragePercent: 92,
    crossTrackDeviationNm: 12,
    trackDeltaDeg: 65,
    ...overrides,
  };
}

function corridor(overrides: Partial<WeatherCorridorIntelligence> = {}): WeatherCorridorIntelligence {
  return {
    version: "weather-corridor-intelligence-v1",
    status: "AVAILABLE",
    horizonMinutes: 30,
    corridorMode: "ROUTE_AWARE",
    routePrecision: "PRECISE",
    events: [],
    wind: {
      status: "AVAILABLE",
      model: "ICON-EU",
      trend: "STABLE",
      deltaAlongTrackKt: 0,
      samples: [],
    },
    sources: [
      { source: "PIREP_AIREP", state: "AVAILABLE", count: 0 },
      { source: "SIGMET", state: "AVAILABLE", count: 1 },
      { source: "ICON_EU", state: "AVAILABLE", count: 1 },
    ],
    ...overrides,
  };
}

describe("Weather Avoidance Intelligence V1", () => {
  it("returns no signal without the underlying SIGMET trajectory deviation", () => {
    expect(buildWeatherAvoidanceIntelligence({
      deviation: null,
      conformance: conformance(),
      weatherCorridor: corridor(),
    })).toBeNull();
  });

  it("graduates to possible weather avoidance when conformance and the 30-minute corridor agree", () => {
    const result = buildWeatherAvoidanceIntelligence({
      deviation: deviation(),
      conformance: conformance(),
      weatherCorridor: corridor(),
    });
    expect(result).toMatchObject({
      classification: "POSSIBLE_WEATHER_AVOIDANCE",
      confidence: "HIGH",
      sigmetId: "SIG1",
      previousExposure: { intersects: true, entryMinutes: 7, distanceNm: 56 },
      currentExposure: { intersects: false, entryMinutes: null, distanceNm: null },
      conformanceStatus: "DEVIATING",
    });
    expect(result?.evidence).toEqual(expect.arrayContaining([
      "PREVIOUS_SIGMET_INTERSECTION",
      "CURRENT_SHORT_PROJECTION_CLEAR",
      "CURRENT_30MIN_CORRIDOR_CLEAR",
      "TRAJECTORY_DEVIATING",
      "ROUTE_AWARE_CORRIDOR",
    ]));
  });

  it("does not claim reduced exposure when the new corridor still enters the same SIGMET", () => {
    const result = buildWeatherAvoidanceIntelligence({
      deviation: deviation(),
      conformance: conformance(),
      weatherCorridor: corridor({
        events: [{
          id: "sigmet:SIG1:entry",
          type: "SIGMET_ENTRY",
          risk: "TURBULENCE",
          offsetMinutes: 12,
          at: "2026-10-05T08:12:00Z",
          distanceAlongCorridorNm: 84,
          lat: 50,
          lon: 16,
          altitudeFt: 30000,
          severity: "HIGH",
          confidence: "HIGH",
          source: "SIGMET",
          sourceReference: "SIG1",
          evidence: ["SEV TURB"],
        }],
      }),
    });
    expect(result).toMatchObject({
      classification: "CURRENT_CORRIDOR_EXPOSED",
      currentExposure: { intersects: true, entryMinutes: 12, distanceNm: 84 },
    });
    expect(result?.evidence).toContain("CURRENT_30MIN_CORRIDOR_EXPOSED");
  });

  it("stays a low-confidence correlation when the 30-minute SIGMET source is unavailable", () => {
    const result = buildWeatherAvoidanceIntelligence({
      deviation: deviation(),
      conformance: conformance(),
      weatherCorridor: null,
    });
    expect(result).toMatchObject({
      classification: "CORRELATED_DEVIATION",
      confidence: "LOW",
      currentExposure: { intersects: null },
    });
    expect(result?.evidence).toContain("SIGMET_SOURCE_UNAVAILABLE");
  });

  it("caps a stale SIGMET-based possible avoidance signal at medium confidence", () => {
    const result = buildWeatherAvoidanceIntelligence({
      deviation: deviation(),
      conformance: conformance(),
      weatherCorridor: corridor({
        status: "PARTIAL",
        sources: [
          { source: "PIREP_AIREP", state: "AVAILABLE", count: 0 },
          { source: "SIGMET", state: "STALE", count: 1 },
          { source: "ICON_EU", state: "AVAILABLE", count: 1 },
        ],
      }),
    });
    expect(result).toMatchObject({
      classification: "POSSIBLE_WEATHER_AVOIDANCE",
      confidence: "MEDIUM",
    });
    expect(result?.evidence).toEqual(expect.arrayContaining(["SIGMET_SOURCE_STALE", "WEATHER_CORRIDOR_PARTIAL"]));
  });

  it("requires trajectory-conformance support for the stronger classification", () => {
    const result = buildWeatherAvoidanceIntelligence({
      deviation: deviation(),
      conformance: conformance({ status: "ON_ROUTE", evidence: ["CORRIDOR_ON_ROUTE"] }),
      weatherCorridor: corridor(),
    });
    expect(result).toMatchObject({
      classification: "CORRELATED_DEVIATION",
      confidence: "MEDIUM",
      currentExposure: { intersects: false },
    });
  });

  it("caps kinematic-corridor evidence at medium confidence", () => {
    const result = buildWeatherAvoidanceIntelligence({
      deviation: deviation(),
      conformance: conformance(),
      weatherCorridor: corridor({ corridorMode: "KINEMATIC", routePrecision: null }),
    });
    expect(result).toMatchObject({
      classification: "POSSIBLE_WEATHER_AVOIDANCE",
      confidence: "MEDIUM",
    });
    expect(result?.evidence).toContain("KINEMATIC_CORRIDOR");
  });
});
