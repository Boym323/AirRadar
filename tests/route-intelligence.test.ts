import { describe, expect, it } from "vitest";
import type { RouteIntelligenceNetwork } from "@/lib/route-intelligence";
import { analyzePublishedRoute, tokenizeRoute } from "@/lib/route-intelligence";

const network: RouteIntelligenceNetwork = {
  source: { name: "fixture", reference: "fixture", effectiveDate: "2026-09-03", aipAmendment: null, airacAmendment: null },
  routes: [{
    designator: "T709",
    points: [
      { id: "A", name: "USUPA", kind: "DESIGNATED_POINT", latitude: 50, longitude: 14, foreignMaintainer: null, remarks: null },
      { id: "B", name: "BODAL", kind: "DESIGNATED_POINT", latitude: 50.2, longitude: 14.4, foreignMaintainer: null, remarks: null },
      { id: "C", name: "TIBLA", kind: "DESIGNATED_POINT", latitude: 50.4, longitude: 14.8, foreignMaintainer: null, remarks: null },
      { id: "D", name: "GAPPT", kind: "DESIGNATED_POINT", latitude: 50.6, longitude: 15.2, foreignMaintainer: null, remarks: null },
    ],
    segments: [
      { id: "T709-A-B", fromName: "USUPA", toName: "BODAL", from: [14, 50], to: [14.4, 50.2], navigationSpecification: "RNAV 5", magTrackForwardDeg: 50, magTrackReverseDeg: 230, distanceNm: 18, upperLimit: "FL195", lowerLimit: "5000 FT AMSL", lowerOverride: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, availabilityStatus: "UNKNOWN", remarks: null },
      { id: "T709-B-C", fromName: "BODAL", toName: "TIBLA", from: [14.4, 50.2], to: [14.8, 50.4], navigationSpecification: "RNAV 5", magTrackForwardDeg: 50, magTrackReverseDeg: 230, distanceNm: 18, upperLimit: "FL195", lowerLimit: "5000 FT AMSL", lowerOverride: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, availabilityStatus: "UNKNOWN", remarks: null },
      { id: "T709-C-D", fromName: "TIBLA", toName: "GAPPT", from: [14.8, 50.4], to: [15.2, 50.6], navigationSpecification: "RNAV 5", magTrackForwardDeg: 50, magTrackReverseDeg: 230, distanceNm: 18, upperLimit: "FL195", lowerLimit: "5000 FT AMSL", lowerOverride: null, cruisingLevelForward: null, cruisingLevelReverse: null, availabilityClass: null, availabilityStatus: "UNKNOWN", remarks: null },
    ],
    discontinuities: [{ afterPointId: "C", beforePointId: "D" }],
  }],
};

function plan(filedRoute: string) {
  return { flightPlan: { filedRoute, waypoints: [], source: "test" } };
}

describe("route intelligence tokenizer", () => {
  it("distinguishes fixes, airways, DCT, and unknown syntax", () => {
    expect(tokenizeRoute("VOZ T709 BODAL DCT ?????", { airwayDesignators: new Set(["T709"]), waypointNames: new Set(["BODAL"]) }).map((token) => token.type)).toEqual(["WAYPOINT", "AIRWAY", "WAYPOINT", "DCT", "UNKNOWN"]);
  });
});

describe("route intelligence matching", () => {
  it("matches an exact published segment and computes dynamic position", () => {
    const result = analyzePublishedRoute({ aircraftRoute: plan("USUPA T709 BODAL"), aircraftPosition: { lat: 50.1, lon: 14.2, track: 50 }, atsNetwork: network });
    expect(result.status).toBe("MATCHED");
    expect(result.matchedSegments.map((segment) => segment.segmentId)).toEqual(["T709-A-B"]);
    expect(result.currentSegment?.segmentId).toBe("T709-A-B");
    expect(result.previousWaypoint?.name).toBe("USUPA");
    expect(result.nextWaypoint?.name).toBe("BODAL");
    expect(result.distanceToNextWaypointNm).toBeGreaterThan(0);
    expect(result.crossTrackDeviationNm).not.toBeNull();
  });

  it("traverses multiple segments only inside the named airway", () => {
    const result = analyzePublishedRoute({ aircraftRoute: plan("USUPA T709 TIBLA"), aircraftPosition: { lat: 50.3, lon: 14.6, track: 50 }, atsNetwork: network });
    expect(result.status).toBe("MATCHED");
    expect(result.matchedSegments.map((segment) => segment.segmentId)).toEqual(["T709-A-B", "T709-B-C"]);
  });

  it("supports reverse filed direction", () => {
    const result = analyzePublishedRoute({ aircraftRoute: plan("BODAL T709 USUPA"), aircraftPosition: { lat: 50.1, lon: 14.2, track: 230 }, atsNetwork: network });
    expect(result.matchedSegments[0]?.direction).toBe("REVERSE");
    expect(result.currentSegment?.fromName).toBe("BODAL");
    expect(result.currentSegment?.toName).toBe("USUPA");
  });

  it("does not invent an ATS leg across DCT", () => {
    const result = analyzePublishedRoute({ aircraftRoute: plan("USUPA DCT BODAL"), aircraftPosition: { lat: 50.1, lon: 14.2 }, atsNetwork: network });
    expect(result.status).toBe("UNRESOLVED");
    expect(result.matchedSegments).toHaveLength(0);
    expect(result.routeCoveragePercent).toBeNull();
  });

  it("does not cross an explicit discontinuity", () => {
    const result = analyzePublishedRoute({ aircraftRoute: plan("TIBLA T709 GAPPT"), aircraftPosition: { lat: 50.5, lon: 15 }, atsNetwork: network });
    expect(result.status).toBe("UNRESOLVED");
    expect(result.matchedSegments).toHaveLength(0);
  });

  it("returns partial data for an international or unknown continuation", () => {
    const result = analyzePublishedRoute({ aircraftRoute: plan("USUPA T709 BODAL DCT ???"), aircraftPosition: { lat: 50.1, lon: 14.2 }, atsNetwork: network });
    expect(result.status).toBe("PARTIAL");
    expect(result.unresolvedRouteTokens).toContain("???");
  });
});

describe("route intelligence fail-closed states", () => {
  it("distinguishes missing route and missing ATS data", () => {
    expect(analyzePublishedRoute({ aircraftRoute: null, aircraftPosition: null, atsNetwork: network }).status).toBe("NO_ROUTE");
    expect(analyzePublishedRoute({ aircraftRoute: plan("USUPA T709 BODAL"), aircraftPosition: null, atsNetwork: null }).status).toBe("NO_ATS_DATA");
  });
});
