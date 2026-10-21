import { describe, expect, it } from "vitest";
import {
  analyzeRouteIntelligenceV2,
  interpretFiledRoute,
  tokenizeRoute,
  type RouteIntelligenceNetwork,
} from "@/lib/route-intelligence";

const network: RouteIntelligenceNetwork = {
  source: { name: "ATS-FIXTURE", reference: "ENR 3.2", effectiveDate: "2026-09-03", aipAmendment: "AMDT 09/26", airacAmendment: null },
  routes: [
    {
      designator: "T709",
      points: [
        { id: "A", name: "ALFA", kind: "DESIGNATED_POINT", latitude: 50, longitude: 14, foreignMaintainer: null, remarks: null },
        { id: "B", name: "BRAVO", kind: "DESIGNATED_POINT", latitude: 50.2, longitude: 14.4, foreignMaintainer: null, remarks: null },
      ],
      segments: [{ id: "T709-A-B", fromName: "ALFA", toName: "BRAVO", from: [14, 50], to: [14.4, 50.2], navigationSpecification: "RNAV 5", magTrackForwardDeg: 50, magTrackReverseDeg: 230, distanceNm: 18, upperLimit: "UNLIMITED", lowerLimit: "GROUND", lowerOverride: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, availabilityStatus: "UNKNOWN", remarks: null }],
      discontinuities: [],
    },
    {
      // The second document represents the cross-country continuation of T709.
      designator: "T709",
      points: [
        { id: "C", name: "CHARLIE", kind: "DESIGNATED_POINT", latitude: 50.4, longitude: 14.8, foreignMaintainer: "DE", remarks: null },
        { id: "D", name: "DELTA", kind: "DESIGNATED_POINT", latitude: 50.6, longitude: 15.2, foreignMaintainer: "DE", remarks: null },
      ],
      segments: [{ id: "T709-C-D", fromName: "CHARLIE", toName: "DELTA", from: [14.8, 50.4], to: [15.2, 50.6], navigationSpecification: "RNAV 5", magTrackForwardDeg: 50, magTrackReverseDeg: 230, distanceNm: 18, upperLimit: "UNLIMITED", lowerLimit: "GROUND", lowerOverride: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, availabilityStatus: "UNKNOWN", remarks: null }],
      discontinuities: [],
    },
  ],
};

function analyze(route: string) {
  return analyzeRouteIntelligenceV2({ filedRoute: route, atsNetwork: network }).route;
}

describe("Route Intelligence V2 retained ATS and DCT engine", () => {
  it("classifies published airways and ordinary filed fixes without procedure promotion", () => {
    expect(tokenizeRoute("S1 ALFA").map((token) => token.type)).toEqual(["AIRWAY", "WAYPOINT"]);
    expect(tokenizeRoute("ALFA T709 BRAVO", { airwayDesignators: new Set(["T709"]) }).map((token) => token.type)).toEqual(["WAYPOINT", "AIRWAY", "WAYPOINT"]);
  });

  it("reconstructs ATS, DCT and cross-border ATS legs in filed order", () => {
    const route = analyze("ALFA T709 BRAVO DCT CHARLIE T709 DELTA");
    expect(route.elements.map((element) => element.kind)).toEqual(["PUBLISHED_ATS", "FILED_DCT", "PUBLISHED_ATS"]);
    expect(route.elements.map((element) => element.label)).toEqual(["T709", "DCT", "T709"]);
    expect(route.coverage.ats).toEqual({ eligibleLegs: 2, matchedLegs: 2, percent: 100 });
    expect(route.procedureMatches).toEqual([]);
    expect(route.coverage.reconstruction).toEqual({ totalElements: 3, resolvedElements: 3, percent: 100 });
  });

  it("keeps the filed DCT outside ATS coverage", () => {
    const route = analyze("ALFA DCT BRAVO");
    expect(route.elements).toHaveLength(1);
    expect(route.elements[0]).toMatchObject({ kind: "FILED_DCT", phase: "EN_ROUTE", status: "RESOLVED", source: { kind: "FILED_DCT" } });
    expect(route.coverage.ats).toEqual({ eligibleLegs: 0, matchedLegs: 0, percent: null });
  });

  it("never turns a procedure-shaped token into a published SID or STAR", () => {
    const route = analyze("DEP1 ALFA T709 BRAVO");
    expect(route.procedureMatches).toEqual([]);
    expect(route.elements.find((element) => element.label === "DEP1")).toMatchObject({ kind: "UNRESOLVED_CONNECTOR", phase: "CONNECTOR", status: "UNRESOLVED" });
    expect(route.elements.some((element) => element.kind === "PUBLISHED_SID" || element.kind === "PUBLISHED_STAR")).toBe(false);
  });

  it("preserves source provenance for the published and filed segments", () => {
    const route = analyze("ALFA T709 BRAVO DCT CHARLIE T709 DELTA");
    expect(route.elements.map((element) => element.source.kind)).toEqual(["PUBLISHED_ATS", "FILED_DCT", "PUBLISHED_ATS"]);
    expect(route.elements[0]?.source).toMatchObject({ provider: "ATS-FIXTURE", reference: "ENR 3.2", effectiveDate: "2026-09-03" });
    expect(route.elements[1]?.source).toMatchObject({ kind: "FILED_DCT", provider: null, procedureId: null });
  });

  it("exposes static results without a dynamic current-element guess", () => {
    const snapshot = analyzeRouteIntelligenceV2({ filedRoute: "ALFA DCT BRAVO", atsNetwork: network });
    expect(snapshot.route.elements[0]?.kind).toBe("FILED_DCT");
    expect(snapshot.dynamic).toMatchObject({ currentElement: null, routeProgress: null, routeAdherence: "UNKNOWN" });
  });

  it("keeps the V2 seam on the backwards-compatible ATS result", () => {
    const route = interpretFiledRoute({ filedRoute: "ALFA T709 BRAVO", atsNetwork: network });
    expect(route.elements[0]?.kind).toBe("PUBLISHED_ATS");
    expect(route.coverage.ats.percent).toBe(100);
  });
});
