import { describe, expect, it } from "vitest";
import type { AircraftView } from "@/lib/aircraft/types";
import { buildFlightSituationSummary } from "@/lib/intelligence/flight-situation-summary";
import type { AtcContextResult } from "@/lib/atc-context/types";
import type { RouteWeatherContext } from "@/lib/weather/route-weather-context";

function aircraft(overrides: Partial<AircraftView> = {}): AircraftView {
  return { onGround: false, verticalRate: -800, baroRate: -800, geomRate: null, ...overrides } as AircraftView;
}

function atc(): AtcContextResult {
  return {
    status: "available",
    position: { lat: 50, lon: 15, altitude: 30_000, altitudeSource: "baro" },
    supportedCountry: true,
    fir: null,
    currentAirspaces: [],
    primaryAirspace: {
      id: "CURRENT", name: "Praha Upper", countryCode: "CZ", airspaceType: "CTA_SECTOR", airspaceClass: null,
      verticalMatch: "true", horizontalMatch: "inside", confidence: "high", lowerLimitFt: null, upperLimitFt: null,
      lowerLimitReference: null, upperLimitReference: null, publishedUnit: "PRAHA CONTROL",
      publishedFrequenciesMhz: [127.35], remarks: null,
      provenance: { source: "eAIP", sourceReference: "ENR", effectiveDate: null, lastVerifiedAt: null },
    },
    atsRoute: null, nearestAtsCandidate: null, nearestPoint: null, nextPoint: null, ahead: null,
    nextSector: {
      airspace: {
        id: "NEXT", name: "Brno Sector", countryCode: "CZ", airspaceType: "CTA_SECTOR", airspaceClass: null,
        verticalMatch: "true", horizontalMatch: "inside", confidence: "high", lowerLimitFt: null, upperLimitFt: null,
        lowerLimitReference: null, upperLimitReference: null, publishedUnit: "BRNO CONTROL",
        publishedFrequenciesMhz: [], remarks: null,
        provenance: { source: "eAIP", sourceReference: "ENR", effectiveDate: null, lastVerifiedAt: null },
      },
      distanceNm: 20, estimatedSeconds: 360, confidence: "high",
    },
    limitation: null, computedAt: "2026-09-26T17:00:00.000Z",
    dataset: { atcVersion: "v", atsVersion: "v", atcCount: 1, atsSegmentCount: 1 },
  };
}

function routeWeather(): RouteWeatherContext {
  return {
    status: "available", routeStatus: "MATCHED", routeCoveragePercent: 90, routeSource: "FlightAware",
    unresolvedRouteTokens: [], stale: false,
    matches: [{
      sigmetId: "S1", hazard: "SEV TURB", firName: "Prague FIR", validTo: "2026-09-26T19:00:00Z",
      routeDesignator: "L610", fromName: "AAA", toName: "BBB", segmentId: "s1",
      segmentConfidence: "HIGH", verticalMatch: "matched", distanceAlongRouteNm: 84,
    }],
  };
}

describe("flight situation summary", () => {
  it("combines observed phase, ATC handoff, route weather and wind deterministically", () => {
    const result = buildFlightSituationSummary({
      aircraft: aircraft(),
      atc: atc(),
      sigmets: [],
      routeWeather: routeWeather(),
      sigmetDeviation: null,
      wind: { levelHpa: 300, representativeAltitudeFt: 30100, model: "ICON-EU", validAt: "2026-09-26T18:00:00Z", stale: false, sourceDistanceKm: 4, windSpeedKt: 45, windFromDeg: 90, headwindKt: 42, tailwindKt: 0, crosswindKt: 16, crosswindFrom: "right" },
      windAhead: { points: [], trend: "more_headwind", deltaAlongTrackKt: 18, furthestDistanceNm: 100 },
    });
    expect(result).toMatchObject({
      phase: "descent",
      currentSector: "Praha Upper",
      currentUnit: "PRAHA CONTROL",
      nextSector: "Brno Sector",
      nextSectorMinutes: 6,
      weatherState: "route_sigmet",
      weatherHazard: "SEV TURB",
      weatherDistanceNm: 84,
      windKind: "headwind",
      windKt: 42,
      windTrend: "more_headwind",
      windTrendDeltaKt: 18,
    });
  });

  it("prioritizes current SIGMET over route and projected SIGMET context", () => {
    const result = buildFlightSituationSummary({
      aircraft: aircraft({ verticalRate: 0 }),
      atc: null,
      sigmets: [
        { id: "P", relation: "projected", estimatedMinutes: 5, distanceNm: 40, hazard: "ICE", phenomenon: null, qualifier: null, firName: null, validTo: null, lowerFt: null, upperFt: null, verticalMatch: "unknown", source: "isigmet" },
        { id: "C", relation: "current", estimatedMinutes: 0, distanceNm: 0, hazard: "TS", phenomenon: null, qualifier: null, firName: null, validTo: null, lowerFt: null, upperFt: null, verticalMatch: "unknown", source: "isigmet" },
      ],
      routeWeather: routeWeather(), sigmetDeviation: null, wind: null, windAhead: null,
    });
    expect(result.weatherState).toBe("current_sigmet");
    expect(result.weatherHazard).toBe("TS");
  });

  it("reports a clear matched route only when route weather is available and fresh", () => {
    const clear = routeWeather(); clear.matches = [];
    expect(buildFlightSituationSummary({ aircraft: aircraft(), atc: null, sigmets: [], routeWeather: clear, sigmetDeviation: null, wind: null, windAhead: null }).weatherState).toBe("clear");
    clear.stale = true;
    expect(buildFlightSituationSummary({ aircraft: aircraft(), atc: null, sigmets: [], routeWeather: clear, sigmetDeviation: null, wind: null, windAhead: null }).weatherState).toBe("unknown");
  });

  it("does not present stale SIGMET or route-weather matches as current situation weather", () => {
    const staleRoute = routeWeather();
    staleRoute.stale = true;
    const result = buildFlightSituationSummary({
      aircraft: aircraft(),
      atc: null,
      sigmets: [{ id: "C", relation: "current", estimatedMinutes: 0, distanceNm: 0, hazard: "TS", phenomenon: null, qualifier: null, firName: null, validTo: null, lowerFt: null, upperFt: null, verticalMatch: "matched", source: "isigmet" }],
      sigmetStale: true,
      routeWeather: staleRoute,
      sigmetDeviation: null,
      wind: null,
      windAhead: null,
    });

    expect(result.weatherState).toBe("unknown");
    expect(result.weatherHazard).toBeNull();
    expect(result.weatherStale).toBe(true);
  });

  it("keeps route-deviation correlation separate from weather state", () => {
    const result = buildFlightSituationSummary({
      aircraft: aircraft({ onGround: true }),
      atc: null, sigmets: [], routeWeather: null,
      sigmetDeviation: {} as never, wind: null, windAhead: null,
    });
    expect(result.phase).toBe("ground");
    expect(result.routeDeviationNearSigmet).toBe(true);
    expect(result.weatherState).toBe("unknown");
  });
});
