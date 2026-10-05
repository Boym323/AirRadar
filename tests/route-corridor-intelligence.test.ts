import { describe, expect, it } from "vitest";
import {
  buildRouteCorridorIntelligence,
  interpretFiledRoute,
  type RouteCorridorTrackerState,
  type RouteIntelligenceV2Snapshot,
} from "@/lib/route-intelligence";
import type { AviationNavPoint } from "@/lib/navigation-data/types";

function nav(id: string, longitude: number): AviationNavPoint {
  return {
    id,
    kind: "FIX",
    type: "I",
    name: null,
    latitude: 0,
    longitude,
    elevationFt: null,
    frequencyMhz: null,
    magneticDeclination: null,
    state: null,
    country: null,
    source: "Aviation Weather Center",
  };
}

function snapshot(crossTrackDeviation: number, secondResolved = true): RouteIntelligenceV2Snapshot {
  const first = {
    id: "leg-1",
    sequence: 1,
    kind: "FILED_ROUTE" as const,
    phase: "ENROUTE" as const,
    label: "Q123",
    from: { id: "A", name: "ALFA", coordinates: { lat: 0, lon: 0 } },
    to: { id: "B", name: "BRAVO", coordinates: { lat: 0, lon: 1 } },
    geometry: { type: "SCHEMATIC" as const, coordinates: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] },
    source: { kind: "FILED_ROUTE" as const, provider: "fixture", countryCode: null, reference: "reference", procedureId: null, effectiveDate: null, airacCycle: null, amendment: null },
    status: "RESOLVED" as const,
    unresolvedReason: null,
  };
  const second = secondResolved ? {
    id: "leg-2",
    sequence: 2,
    kind: "FILED_DCT" as const,
    phase: "ENROUTE" as const,
    label: "DCT",
    from: { id: "B", name: "BRAVO", coordinates: { lat: 0, lon: 1 } },
    to: { id: "C", name: "CHARLIE", coordinates: { lat: 0, lon: 2 } },
    geometry: { type: "LINE" as const, coordinates: [{ lat: 0, lon: 1 }, { lat: 0, lon: 2 }] },
    source: { kind: "FILED_DCT" as const, provider: "fixture", countryCode: null, reference: "reference", procedureId: null, effectiveDate: null, airacCycle: null, amendment: null },
    status: "RESOLVED" as const,
    unresolvedReason: null,
  } : {
    id: "leg-2",
    sequence: 2,
    kind: "UNRESOLVED_CONNECTOR" as const,
    phase: "CONNECTOR" as const,
    label: "BRAVO-CHARLIE",
    from: null,
    to: null,
    geometry: null,
    source: { kind: "SCHEMATIC" as const, provider: "fixture", countryCode: null, reference: null, procedureId: null, effectiveDate: null, airacCycle: null, amendment: null },
    status: "UNRESOLVED" as const,
    unresolvedReason: "fixture gap",
  };

  return {
    route: {
      id: "filed:ALFA Q123 BRAVO DCT CHARLIE",
      status: secondResolved ? "RESOLVED" : "PARTIAL",
      elements: [first, second],
      procedureMatches: [],
      sources: [first.source, second.source],
      coverage: {
        ats: { eligibleLegs: 1, matchedLegs: 0, percent: 0 },
        reconstruction: { totalElements: 2, resolvedElements: secondResolved ? 2 : 1, percent: secondResolved ? 100 : 50 },
        progress: null,
      },
    },
    dynamic: {
      currentPhase: "ENROUTE",
      currentElement: first,
      previousPoint: first.from,
      nextPoint: first.to,
      distanceToNext: 30,
      crossTrackDeviation,
      alongTrackDistance: 30,
      routeAdherence: crossTrackDeviation <= 2 ? "ON_ROUTE" : crossTrackDeviation <= 10 ? "NEAR_ROUTE" : "OFF_ROUTE",
      completedElements: [],
      remainingElements: ["leg-2"],
      routeProgress: 0.25,
      routeProgressPercent: 25,
      precision: secondResolved ? "PRECISE" : "PARTIAL",
      progressPrecision: secondResolved ? "PRECISE" : "ESTIMATED",
    },
    runway: { reportedRunway: null, inferredRunway: null, status: "UNKNOWN", conflict: false },
  };
}

describe("Route Corridor Intelligence V1", () => {
  it("uses bounded AWC references for schematic filed connectors without claiming published ATS geometry", () => {
    const references = [nav("ALFA", 0), nav("BRAVO", 1)];
    const route = interpretFiledRoute({
      filedRoute: "ALFA Q123 BRAVO",
      referencePoints: references,
      atsNetwork: null,
    });
    expect(route.status).toBe("RESOLVED");
    expect(route.elements).toHaveLength(1);
    expect(route.elements[0]).toMatchObject({
      kind: "FILED_ROUTE",
      status: "RESOLVED",
      label: "Q123",
      geometry: { type: "SCHEMATIC" },
      source: { kind: "FILED_ROUTE", reference: "Reference waypoint coordinates; published airway geometry unresolved" },
    });
  });

  it("computes route progress, remaining distance, ETA and expected-track difference", () => {
    const result = buildRouteCorridorIntelligence(snapshot(1), {
      observedAt: 10_000,
      lat: 0,
      lon: 0.5,
      trackDeg: 95,
      groundSpeedKt: 300,
    });
    expect(result.snapshot.status).toBe("ON_ROUTE");
    expect(result.snapshot.progressPercent).toBe(25);
    expect(result.snapshot.remainingDistanceNm).toBeGreaterThan(89);
    expect(result.snapshot.remainingDistanceNm).toBeLessThan(91);
    expect(result.snapshot.remainingDistanceComplete).toBe(true);
    expect(result.snapshot.etaRemainingMinutes).toBeGreaterThan(17);
    expect(result.snapshot.etaRemainingMinutes).toBeLessThan(19);
    expect(result.snapshot.expectedTrackDeg).toBeCloseTo(90, 1);
    expect(result.snapshot.trackDeltaDeg).toBeCloseTo(5, 1);
    expect(result.snapshot.confidence).toBe("HIGH");
  });

  it("requires persistent off-route evidence before publishing DEVIATING and confirms recovery", () => {
    let tracker: RouteCorridorTrackerState | null = null;
    for (const observedAt of [0, 5_000]) {
      const result = buildRouteCorridorIntelligence(snapshot(12), {
        observedAt,
        lat: 0.2,
        lon: 0.5,
        trackDeg: 90,
        groundSpeedKt: 250,
      }, tracker);
      tracker = result.tracker;
      expect(result.snapshot.status).toBe("OFFSET");
    }
    const confirmed = buildRouteCorridorIntelligence(snapshot(12), {
      observedAt: 11_000,
      lat: 0.2,
      lon: 0.5,
      trackDeg: 90,
      groundSpeedKt: 250,
    }, tracker);
    expect(confirmed.snapshot.status).toBe("DEVIATING");

    const recovering = buildRouteCorridorIntelligence(snapshot(1), {
      observedAt: 12_000,
      lat: 0,
      lon: 0.5,
      trackDeg: 90,
      groundSpeedKt: 250,
    }, confirmed.tracker);
    expect(recovering.snapshot.status).toBe("DEVIATING");

    const recovered = buildRouteCorridorIntelligence(snapshot(1), {
      observedAt: 17_000,
      lat: 0,
      lon: 0.5,
      trackDeg: 90,
      groundSpeedKt: 250,
    }, recovering.tracker);
    expect(recovered.snapshot.status).toBe("ON_ROUTE");
  });

  it("marks remaining distance as partial when unresolved route geometry remains", () => {
    const result = buildRouteCorridorIntelligence(snapshot(4, false), {
      observedAt: 10_000,
      lat: 0,
      lon: 0.5,
      trackDeg: 90,
      groundSpeedKt: 300,
    });
    expect(result.snapshot.status).toBe("OFFSET");
    expect(result.snapshot.remainingDistanceComplete).toBe(false);
    expect(result.snapshot.reconstructionCoveragePercent).toBe(50);
    expect(result.snapshot.confidence).toBe("MEDIUM");
  });
});
