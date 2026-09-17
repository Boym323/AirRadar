import { describe, expect, it } from "vitest";
import {
  analyzeRouteIntelligenceV2,
  interpretFiledRoute,
  tokenizeRoute,
  type Procedure,
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

function procedure(overrides: Partial<Procedure> = {}): Procedure {
  const type = overrides.type ?? "SID";
  const designator = overrides.designator ?? (type === "SID" ? "DEP1" : "ARR1");
  const airportIcao = overrides.airportIcao ?? (type === "SID" ? "LKPR" : "EDDF");
  const fix = type === "SID" ? "ALFA" : "DELTA";
  return {
    id: `${airportIcao}-${type}-${designator}-${overrides.transition ?? "NONE"}`,
    airportIcao,
    designator,
    type,
    transition: overrides.transition ?? fix,
    runwayApplicability: overrides.runwayApplicability ?? { kind: "ALL", runwayDesignators: [] },
    legs: [{
      sequence: 1,
      type: "COURSE_TO_FIX",
      from: { id: `${designator}-FROM`, name: type === "SID" ? "RWY24" : "IAF", kind: type === "SID" ? "RUNWAY" : "FIX", coordinates: { lat: 49.9, lon: 13.8 }, sourceReference: "AD 2.22" },
      to: { id: `${designator}-TO`, name: fix, kind: "FIX", coordinates: { lat: type === "SID" ? 50 : 50.6, lon: type === "SID" ? 14 : 15.2 }, sourceReference: "AD 2.22" },
      geometry: null,
      courseDeg: 240,
      sourceReference: "AD 2.22",
    }],
    discontinuities: [],
    source: { countryCode: "CZ", provider: "AIP-FIXTURE", reference: `AD 2 ${airportIcao}`, effectiveDate: "2026-09-03", airacCycle: "AIRAC 09/2026", amendment: "AMDT 09/26", retrievedAt: null },
    ...overrides,
  };
}

const sid = procedure({});
const star = procedure({ type: "STAR" });

function analyze(route: string, extra: Partial<Parameters<typeof analyzeRouteIntelligenceV2>[0]> = {}) {
  return analyzeRouteIntelligenceV2({
    filedRoute: route,
    originAirportIcao: "LKPR",
    destinationAirportIcao: "EDDF",
    atsNetwork: network,
    procedures: [sid, star],
    ...extra,
  }).route;
}

describe("Route Intelligence V2 static engine", () => {
  it("gives contextual SID/STAR recognition priority over generic airway syntax", () => {
    expect(tokenizeRoute("S1 ALFA", { procedures: [procedure({ designator: "S1", type: "SID" })], originAirportIcao: "LKPR" }).map((token) => token.type)).toEqual(["SID", "WAYPOINT"]);
    expect(tokenizeRoute("S1 ALFA", { procedures: [procedure({ designator: "S1", type: "SID" })] })[0]?.type).toBe("AIRWAY");
  });

  it("reconstructs SID, ATS, filed DCT, cross-country ATS, and STAR in filed order", () => {
    const route = analyze("DEP1 ALFA T709 BRAVO DCT CHARLIE T709 DELTA ARR1");
    expect(route.elements.map((element) => element.kind)).toEqual(["PUBLISHED_SID", "PUBLISHED_ATS", "FILED_DCT", "PUBLISHED_ATS", "PUBLISHED_STAR"]);
    expect(route.elements.map((element) => element.label)).toEqual(["DEP1", "T709", "DCT", "T709", "ARR1"]);
    expect(route.coverage.ats).toEqual({ eligibleLegs: 2, matchedLegs: 2, percent: 100 });
    expect(route.coverage.reconstruction).toEqual({ totalElements: 5, resolvedElements: 5, percent: 100 });
    expect(route.coverage.progress).toBeNull();
  });

  it("keeps an unambiguous DCT filed and outside ATS coverage", () => {
    const route = analyze("ALFA DCT BRAVO", { procedures: [] });
    expect(route.elements).toHaveLength(1);
    expect(route.elements[0]).toMatchObject({ kind: "FILED_DCT", phase: "EN_ROUTE", status: "RESOLVED", source: { kind: "FILED_DCT" } });
    expect(route.coverage.ats).toEqual({ eligibleLegs: 0, matchedLegs: 0, percent: null });
  });

  it("does not recognize a procedure at the wrong airport", () => {
    const route = analyze("DEP1 ALFA T709 BRAVO", { originAirportIcao: "LZIB", destinationAirportIcao: null, procedures: [sid] });
    expect(route.elements.some((element) => element.kind === "PUBLISHED_SID")).toBe(false);
    expect(route.elements.find((element) => element.label === "DEP1")).toMatchObject({ kind: "UNRESOLVED_CONNECTOR", status: "UNRESOLVED" });
  });

  it("leaves equally suitable procedure candidates unresolved", () => {
    const ambiguous = analyze("DEP1 ALFA T709 BRAVO", {
      procedures: [procedure({ id: "sid-a", transition: null }), procedure({ id: "sid-b", transition: null })],
    });
    expect(ambiguous.procedureMatches[0]).toMatchObject({ status: "UNRESOLVED", ambiguous: true, candidateCount: 2, selectedProcedureId: null });
    expect(ambiguous.elements[0]).toMatchObject({ kind: "UNRESOLVED_CONNECTOR", phase: "SID" });
  });

  it("does not promote an unknown procedure or procedure-shaped airway token", () => {
    const unknown = analyze("MISSING1 ALFA T709 BRAVO", { procedures: [] });
    expect(unknown.elements[0]).toMatchObject({ kind: "UNRESOLVED_CONNECTOR", status: "UNRESOLVED" });
    expect(tokenizeRoute("ALFA B1 BRAVO", { airwayDesignators: new Set(["B1"]) }).map((token) => token.type)).toEqual(["WAYPOINT", "AIRWAY", "WAYPOINT"]);
  });

  it("retains publication and filed provenance on every reconstructed element", () => {
    const route = analyze("DEP1 ALFA T709 BRAVO DCT CHARLIE T709 DELTA ARR1");
    expect(route.elements.map((element) => element.source.kind)).toEqual(["PUBLISHED_SID", "PUBLISHED_ATS", "FILED_DCT", "PUBLISHED_ATS", "PUBLISHED_STAR"]);
    expect(route.elements[0]?.source).toMatchObject({ provider: "AIP-FIXTURE", procedureId: sid.id, reference: "AD 2 LKPR" });
    expect(route.elements[1]?.source).toMatchObject({ provider: "ATS-FIXTURE", reference: "ENR 3.2", effectiveDate: "2026-09-03" });
    expect(route.elements[2]?.source).toMatchObject({ kind: "FILED_DCT", provider: null, procedureId: null });
    expect(route.elements.every((element) => "geometry" in element && "source" in element)).toBe(true);
  });

  it("exposes the static snapshot without dynamic current-element behavior", () => {
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
