import { describe, expect, it } from "vitest";
import {
  analyzeDynamicRoute,
  DYNAMIC_ROUTE_THRESHOLDS_NM,
  matchObservedProcedure,
  type InterpretedRoute,
  type InterpretedRouteElement,
  type ProcedureMatch,
  type RouteCoordinate,
  type RouteElementSource,
} from "@/lib/route-intelligence";

const source: RouteElementSource = {
  kind: "SCHEMATIC", provider: "fixture", countryCode: "XX", reference: "fixture",
  procedureId: null, effectiveDate: null, airacCycle: null, amendment: null,
};

function point(id: string, lon: number, lat = 0) {
  return { id, name: id, coordinates: { lon, lat } satisfies RouteCoordinate };
}

function element(
  id: string,
  sequence: number,
  from: ReturnType<typeof point>,
  to: ReturnType<typeof point>,
  kind: InterpretedRouteElement["kind"] = "PUBLISHED_ATS",
  phase: InterpretedRouteElement["phase"] = "ENROUTE",
  procedureId: string | null = null,
): InterpretedRouteElement {
  return {
    id, sequence, kind, phase, label: id, from, to,
    geometry: { type: "LINE", coordinates: [from.coordinates!, to.coordinates!] },
    source: { ...source, kind: kind === "UNRESOLVED_CONNECTOR" ? "SCHEMATIC" : kind, procedureId }, status: "RESOLVED", unresolvedReason: null,
  };
}

function route(elements: InterpretedRouteElement[], procedureMatches: ProcedureMatch[] = []): InterpretedRoute {
  const resolved = elements.filter((item) => item.status === "RESOLVED");
  return {
    id: "fixture-route", status: elements.every((item) => item.status === "RESOLVED") ? "RESOLVED" : "PARTIAL",
    elements, procedureMatches, sources: elements.map((item) => item.source),
    coverage: {
      ats: { eligibleLegs: 0, matchedLegs: 0, percent: null },
      reconstruction: { totalElements: elements.length, resolvedElements: resolved.length, percent: elements.length ? resolved.length / elements.length * 100 : null },
      progress: null,
    },
  };
}

const airportProcedureMatch = (procedureId: string, type: "SID" | "STAR", airportIcao = "TEST"): ProcedureMatch => ({
  status: "INFERRED_HIGH", selectedProcedureId: procedureId, candidateCount: 1, ambiguous: false,
  ambiguityReason: null, confidence: 0.95, runwayCompatibility: "UNKNOWN", evidence: [],
  candidates: [{ procedureId, airportIcao, designator: `${type}FIX`, type, transition: null, confidence: 0.95, runwayCompatibility: "UNKNOWN", evidence: [] }],
});

describe("dynamic route intelligence", () => {
  it("identifies SID phase and ordered current/next points", () => {
    const sid = element("sid-1", 1, point("RWY", 0), point("SIDFIX", 1), "PUBLISHED_SID", "SID", "sid-proc");
    const state = analyzeDynamicRoute({ route: route([sid], [airportProcedureMatch("sid-proc", "SID")]), aircraft: { lat: 0.01, lon: 0.5, track: 90, altitude: 5_000 } });
    expect(state.currentPhase).toBe("SID");
    expect(state.currentElement?.id).toBe("sid-1");
    expect(state.previousPoint?.id).toBe("RWY");
    expect(state.nextPoint?.id).toBe("SIDFIX");
  });

  it("identifies enroute and STAR phases from ordered element kinds", () => {
    const ats = element("ats-1", 1, point("A", 0), point("B", 1));
    const star = element("star-1", 2, point("B", 1), point("ARR", 2), "PUBLISHED_STAR", "STAR", "star-proc");
    expect(analyzeDynamicRoute({ route: route([ats, star]), aircraft: { lat: 0, lon: 0.5, track: 90, altitude: 30_000 } }).currentPhase).toBe("ENROUTE");
    expect(analyzeDynamicRoute({ route: route([ats, star]), aircraft: { lat: 0, lon: 1.5, track: 90, altitude: 8_000 } }).currentPhase).toBe("STAR");
  });

  it("computes next distance, cross-track, along-track, and percent progress", () => {
    const leg = element("leg-1", 1, point("A", 0), point("B", 1));
    const state = analyzeDynamicRoute({ route: route([leg]), aircraft: { lat: 0.01, lon: 0.25, track: 90 } });
    expect(state.distanceToNext).toBeGreaterThan(40);
    expect(state.crossTrackDeviation).toBeGreaterThan(0);
    expect(state.alongTrackDistance).toBeGreaterThan(10);
    expect(state.routeProgress).toBeGreaterThan(0.2);
    expect(state.routeProgressPercent).toBeCloseTo((state.routeProgress ?? 0) * 100);
  });

  it("uses previous progression to resolve a self-crossing route", () => {
    const first = element("first", 1, point("A", 0), point("X", 2));
    const later = element("later", 2, point("X", 2), point("A", 0, 2));
    const state = analyzeDynamicRoute({
      route: route([first, later]), aircraft: { lat: 0, lon: 0.01, track: 90 },
      previousState: analyzeDynamicRoute({ route: route([first, later]), aircraft: { lat: 0, lon: 1, track: 90 } }),
    });
    expect(state.currentElement?.id).toBe("first");
  });

  it("moves backwards to the preceding leg instead of jumping forward", () => {
    const first = element("first", 1, point("A", 0), point("B", 1));
    const second = element("second", 2, point("B", 1), point("C", 2));
    const routeValue = route([first, second]);
    const prior = analyzeDynamicRoute({ route: routeValue, aircraft: { lat: 0, lon: 1.5, track: 90 } });
    const state = analyzeDynamicRoute({ route: routeValue, aircraft: { lat: 0, lon: 0.5, track: 90 }, previousState: prior });
    expect(state.currentElement?.id).toBe("first");
    expect(state.completedElements).toEqual([]);
  });

  it("applies explicit adherence thresholds without treating off-route as a violation", () => {
    const leg = element("leg", 1, point("A", 0), point("B", 1));
    const near = analyzeDynamicRoute({ route: route([leg]), aircraft: { lat: 0.1, lon: 0.5, track: 90 } });
    const off = analyzeDynamicRoute({ route: route([leg]), aircraft: { lat: 0.3, lon: 0.5, track: 90 } });
    expect(DYNAMIC_ROUTE_THRESHOLDS_NM).toEqual({ onRoute: 2, nearRoute: 10 });
    expect(near.routeAdherence).toBe("NEAR_ROUTE");
    expect(off.routeAdherence).toBe("OFF_ROUTE");
  });

  it("keeps unresolved geometry in remaining elements and estimates partial progress", () => {
    const first = element("first", 1, point("A", 0), point("B", 1));
    const gap: InterpretedRouteElement = { ...element("gap", 2, point("B", 1), point("C", 2)), geometry: null, status: "UNRESOLVED", unresolvedReason: "missing geometry" };
    const last = element("last", 3, point("C", 2), point("D", 3));
    const state = analyzeDynamicRoute({ route: route([first, gap, last]), aircraft: { lat: 0, lon: 2.5, track: 90 } });
    expect(state.currentElement?.id).toBe("last");
    expect(state.remainingElements).toContain("gap");
    expect(state.progressPrecision).toBe("ESTIMATED");
    expect(state.precision).toBe("PARTIAL");
  });

  it("returns unavailable semantics when position or geometry is missing", () => {
    const gap: InterpretedRouteElement = { ...element("gap", 1, point("A", 0), point("B", 1)), geometry: null, status: "UNRESOLVED", unresolvedReason: "not published" };
    expect(analyzeDynamicRoute({ route: route([gap]), aircraft: { lat: null, lon: null, track: 90 } })).toMatchObject({ routeAdherence: "UNKNOWN", precision: "UNAVAILABLE", progressPrecision: "UNAVAILABLE" });
  });

  it("requires airport context, direction, and two consecutive SID legs", () => {
    const sid1 = element("sid-1", 1, point("R", 0), point("S1", 1), "PUBLISHED_SID", "SID", "sid-proc");
    const sid2 = element("sid-2", 2, point("S1", 1), point("S2", 2), "PUBLISHED_SID", "SID", "sid-proc");
    const sidRoute = route([sid1, sid2], [airportProcedureMatch("sid-proc", "SID")]);
    expect(matchObservedProcedure({ route: sidRoute, procedureType: "SID", airportIcao: "TEST", observations: [{ lat: 0, lon: 0.8, track: 90 }, { lat: 0, lon: 1.2, track: 90 }] }).status).toBe("MATCHED");
    expect(matchObservedProcedure({ route: sidRoute, procedureType: "SID", airportIcao: "TEST", observations: [{ lat: 0, lon: 0.8, track: 270 }, { lat: 0, lon: 1.2, track: 270 }] }).status).toBe("REJECTED");
    expect(matchObservedProcedure({ route: sidRoute, procedureType: "SID", observations: [{ lat: 0, lon: 0.8, track: 90 }, { lat: 0, lon: 1.2, track: 90 }] }).status).toBe("UNRESOLVED");
  });

  it("does not confirm a STAR from one nearby pass or wrong airport", () => {
    const star1 = element("star-1", 1, point("E", 0), point("S1", 1), "PUBLISHED_STAR", "STAR", "star-proc");
    const star2 = element("star-2", 2, point("S1", 1), point("A", 2), "PUBLISHED_STAR", "STAR", "star-proc");
    const starRoute = route([star1, star2], [airportProcedureMatch("star-proc", "STAR")]);
    expect(matchObservedProcedure({ route: starRoute, procedureType: "STAR", airportIcao: "TEST", observations: [{ lat: 0, lon: 0.8, track: 90 }] }).status).toBe("REJECTED");
    expect(matchObservedProcedure({ route: starRoute, procedureType: "STAR", airportIcao: "OTHER", observations: [{ lat: 0, lon: 0.8, track: 90 }, { lat: 0, lon: 1.2, track: 90 }] }).status).toBe("REJECTED");
  });
});
