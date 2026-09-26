import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import type { RouteIntelligenceResult } from "@/lib/route-intelligence";
import type { SigmetSnapshot } from "@/lib/weather/types";
import { buildRouteWeatherContext } from "@/lib/weather/route-weather-context";

function aircraft(altitude = 20_000): Aircraft {
  return {
    icaoHex: "abc123", callsign: "TEST123", registration: null, aircraftType: "A320", aircraftDescription: null,
    lat: 50, lon: 14, altitude, baroAltitude: altitude, geomAltitude: altitude, groundSpeed: 450, track: 90,
    verticalRate: 0, baroRate: 0, geomRate: 0, squawk: null, category: null, emergency: null, rssi: null,
    messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-26T17:00:00.000Z", source: "ADS-B",
    sourceType: null, onGround: false, distanceKm: null, bearing: null, trail: [],
  };
}

function route(): RouteIntelligenceResult {
  return {
    status: "MATCHED",
    confidence: 0.9,
    confidenceLevel: "HIGH",
    routeCoveragePercent: 100,
    tokens: [],
    matchedWaypoints: [],
    matchedSegments: [
      {
        segmentId: "seg-1", routeDesignator: "L610", fromName: "AAA", toName: "BBB",
        from: [14, 50], to: [15, 50], direction: "FORWARD", routeLegIndex: 0, confidence: "HIGH",
        crossTrackDeviationNm: 1, alongTrackProgress: 0.5, headingCompatible: true,
      },
      {
        segmentId: "seg-2", routeDesignator: "L610", fromName: "BBB", toName: "CCC",
        from: [15, 50], to: [16, 50], direction: "FORWARD", routeLegIndex: 1, confidence: "HIGH",
        crossTrackDeviationNm: 1, alongTrackProgress: null, headingCompatible: true,
      },
    ],
    unresolvedRouteTokens: [],
    currentSegment: null,
    previousWaypoint: null,
    nextWaypoint: null,
    distanceToNextWaypointNm: null,
    crossTrackDeviationNm: null,
    progress: { completedSegmentIds: [], currentSegmentId: "seg-1", remainingSegmentIds: ["seg-2"] },
    source: { aircraftRouteSource: "FlightAware", atsEffectiveDate: "2026-09-01", atsName: "eAIP", atsReference: "ENR 3" },
  };
}

function sigmets(lowerFt: number | null = 10_000, upperFt: number | null = 30_000): SigmetSnapshot {
  return {
    type: "FeatureCollection",
    fetchedAt: "2026-09-26T17:00:00.000Z",
    stale: false,
    features: [{
      type: "Feature",
      id: "SIG-1",
      properties: {
        id: "SIG-1", issuingOffice: "LKPR", firId: "LKAA", firName: "Prague FIR", phenomenon: "TURB",
        hazard: "SEV TURB", qualifier: "OBS", validFrom: "2026-09-26T16:00:00.000Z",
        validTo: "2026-09-26T19:00:00.000Z", lowerFt, upperFt, seriesId: "1", rawText: null,
        source: "isigmet", fetchedAt: "2026-09-26T17:00:00.000Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[14.7, 49.8], [15.3, 49.8], [15.3, 50.2], [14.7, 50.2], [14.7, 49.8]]],
      },
    }],
  };
}

describe("route weather context", () => {
  it("finds SIGMET intersections on current/remaining published route segments", () => {
    const result = buildRouteWeatherContext(aircraft(), route(), sigmets());
    expect(result.status).toBe("available");
    expect(result.matches.map((match) => match.segmentId)).toEqual(["seg-1", "seg-2"]);
    expect(result.matches[0]).toMatchObject({ hazard: "SEV TURB", routeDesignator: "L610", verticalMatch: "matched" });
  });

  it("detects a polygon crossing even when both route-segment endpoints are outside", () => {
    const r = route();
    r.matchedSegments = [{ ...r.matchedSegments[0]!, from: [14, 50], to: [16, 50] }];
    r.progress = { completedSegmentIds: [], currentSegmentId: "seg-1", remainingSegmentIds: [] };
    expect(buildRouteWeatherContext(aircraft(), r, sigmets()).matches).toHaveLength(1);
  });

  it("suppresses a SIGMET that is outside the aircraft altitude", () => {
    expect(buildRouteWeatherContext(aircraft(35_000), route(), sigmets(10_000, 30_000)).matches).toEqual([]);
  });

  it("marks altitude relevance unknown when advisory limits are unavailable", () => {
    expect(buildRouteWeatherContext(aircraft(), route(), sigmets(null, null)).matches[0]?.verticalMatch).toBe("unknown");
  });

  it("does not inspect completed route segments", () => {
    const r = route();
    r.progress = { completedSegmentIds: ["seg-1"], currentSegmentId: null, remainingSegmentIds: ["seg-2"] };
    const result = buildRouteWeatherContext(aircraft(), r, sigmets());
    expect(result.matches.map((match) => match.segmentId)).toEqual(["seg-2"]);
  });

  it("keeps unresolved route tokens visible in the result", () => {
    const r = route();
    r.unresolvedRouteTokens = ["BADFIX"];
    const result = buildRouteWeatherContext(aircraft(), r, sigmets());
    expect(result.unresolvedRouteTokens).toEqual(["BADFIX"]);
    expect(result.routeSource).toBe("FlightAware");
  });
});
