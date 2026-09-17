import { describe, expect, it } from "vitest";
import {
  createRunwayContext,
  hasRunwayConflict,
  type InterpretedRoute,
  type InterpretedRouteElement,
  type Procedure,
  type ProcedureMatch,
  type RouteElementSource,
} from "@/lib/route-intelligence";

const source: RouteElementSource = {
  kind: "PUBLISHED_SID",
  provider: "AIP-PROVIDER",
  countryCode: "CZ",
  reference: "LKPR AD 2.22",
  procedureId: "LKPR-SID-RWY24-1",
  effectiveDate: "2026-09-03",
  airacCycle: "AIRAC 09/2026",
  amendment: "AMDT 09/26",
};

const sid: Procedure = {
  id: "LKPR-SID-RWY24-1",
  airportIcao: "LKPR",
  designator: "BODAL1W",
  type: "SID",
  transition: "BODAL",
  runwayApplicability: { kind: "INCLUDE", runwayDesignators: ["24"] },
  legs: [{
    sequence: 1,
    type: "COURSE_TO_FIX",
    from: { id: "RWY24", name: "24", kind: "RUNWAY", coordinates: { lat: 50.1, lon: 14.2 }, sourceReference: "AD 2.22" },
    to: { id: "BODAL", name: "BODAL", kind: "FIX", coordinates: null, sourceReference: "AD 2.22" },
    geometry: null,
    courseDeg: 240,
    sourceReference: "AD 2.22",
  }],
  discontinuities: [],
  source: {
    countryCode: "CZ",
    provider: "AIP-PROVIDER",
    reference: "LKPR AD 2.22",
    effectiveDate: "2026-09-03",
    airacCycle: "AIRAC 09/2026",
    amendment: "AMDT 09/26",
    retrievedAt: null,
  },
};

function element(overrides: Partial<InterpretedRouteElement> = {}): InterpretedRouteElement {
  return {
    id: "sid-1",
    sequence: 1,
    kind: "PUBLISHED_SID",
    phase: "SID",
    label: "BODAL1W",
    from: null,
    to: null,
    geometry: null,
    source,
    status: "RESOLVED",
    unresolvedReason: null,
    ...overrides,
  };
}

describe("Route Intelligence V2 contracts", () => {
  it("represents SID/STAR procedures with incomplete geometry and discontinuities", () => {
    const star: Procedure = { ...sid, id: "LKPR-STAR-1", designator: "BODAL1A", type: "STAR", transition: null, legs: [{ ...sid.legs[0], geometry: null }], discontinuities: [{ sequence: 2, afterLegSequence: 1, beforeLegSequence: 2, afterPointId: "BODAL", beforePointId: "FINAL", reason: "published discontinuity", sourceReference: "AD 2.22" }] };
    expect(sid.type).toBe("SID");
    expect(star.type).toBe("STAR");
    expect(star.legs[0]?.geometry).toBeNull();
    expect(star.discontinuities).toHaveLength(1);
  });

  it("keeps DCT distinct from published ATS and preserves element provenance", () => {
    const dctSource: RouteElementSource = { ...source, kind: "FILED_DCT", procedureId: null };
    const dct = element({ id: "dct-1", kind: "FILED_DCT", phase: "EN_ROUTE", source: dctSource, status: "RESOLVED" });
    const route: InterpretedRoute = {
      id: "route-1",
      status: "PARTIAL",
      elements: [dct],
      procedureMatches: [],
      sources: [dctSource],
      coverage: {
        ats: { eligibleLegs: 0, matchedLegs: 0, percent: null },
        reconstruction: { totalElements: 1, resolvedElements: 1, percent: 100 },
        progress: null,
      },
    };
    expect(dct.kind).toBe("FILED_DCT");
    expect(dct.kind).not.toBe("PUBLISHED_ATS");
    expect(route.elements[0]?.source.reference).toBe("LKPR AD 2.22");
  });

  it("preserves runway conflicts without overwriting either observation", () => {
    const context = createRunwayContext({ reportedRunway: "24", inferredRunway: "06" });
    expect(context).toMatchObject({ reportedRunway: "24", inferredRunway: "06", status: "REPORTED", conflict: true });
    expect(hasRunwayConflict(context)).toBe(true);
  });

  it("represents ambiguous and unresolved procedure matches", () => {
    const match: ProcedureMatch = {
      status: "UNRESOLVED",
      selectedProcedureId: null,
      candidateCount: 2,
      ambiguous: true,
      ambiguityReason: "two runway-compatible candidates",
      confidence: null,
      runwayCompatibility: "INCOMPATIBLE",
      evidence: [],
      candidates: [],
    };
    const unresolved = element({ kind: "UNRESOLVED_CONNECTOR", phase: "CONNECTOR", status: "UNRESOLVED", source: { ...source, kind: "SCHEMATIC", procedureId: null }, unresolvedReason: "outside loaded ATS coverage" });
    expect(match.candidateCount).toBe(2);
    expect(match.ambiguous).toBe(true);
    expect(match.runwayCompatibility).toBe("INCOMPATIBLE");
    expect(unresolved.status).toBe("UNRESOLVED");
    expect(unresolved.source.kind).toBe("SCHEMATIC");
  });
});
