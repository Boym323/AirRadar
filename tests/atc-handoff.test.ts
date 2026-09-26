import { describe, expect, it } from "vitest";
import { buildAtcHandoffEstimate } from "@/lib/atc-context/handoff";
import type { AtcContextResult, ContextAirspace } from "@/lib/atc-context/types";

function airspace(id: string, name: string, overrides: Partial<ContextAirspace> = {}): ContextAirspace {
  return {
    id,
    name,
    countryCode: "CZ",
    airspaceType: "CTA_SECTOR",
    airspaceClass: "C",
    verticalMatch: "true",
    horizontalMatch: "inside",
    confidence: "high",
    lowerLimitFt: 0,
    upperLimitFt: 66000,
    lowerLimitReference: "SFC",
    upperLimitReference: "FL",
    publishedUnit: null,
    publishedFrequenciesMhz: [],
    remarks: null,
    provenance: {
      source: "fixture",
      sourceReference: "fixture",
      effectiveDate: "2026-09-03",
      lastVerifiedAt: "2026-09-03T00:00:00.000Z",
    },
    ...overrides,
  };
}

function context(overrides: Partial<AtcContextResult> = {}): AtcContextResult {
  const current = airspace("CURRENT", "Current sector", { publishedUnit: "PRAHA RADAR", publishedFrequenciesMhz: [127.125] });
  const next = airspace("NEXT", "Next sector", { publishedUnit: "PRAHA RADAR", publishedFrequenciesMhz: [132.89, 134.48] });
  return {
    status: "available",
    position: { lat: 50, lon: 15, altitude: 25000, altitudeSource: "baro" },
    supportedCountry: true,
    fir: null,
    currentAirspaces: [current],
    primaryAirspace: current,
    atsRoute: null,
    nearestAtsCandidate: null,
    nearestPoint: null,
    nextPoint: null,
    ahead: null,
    nextSector: { airspace: next, distanceNm: 8.5, estimatedSeconds: 120, confidence: "high" },
    limitation: "Ahead on current track only; no turn or flight-plan prediction",
    computedAt: "2026-09-26T12:00:00.000Z",
    dataset: { atcVersion: "2026-09-03", atsVersion: "2026-09-03", atcCount: 2, atsSegmentCount: 0 },
    ...overrides,
  };
}

describe("ATC handoff estimate", () => {
  it("projects the next published sector, unit and frequencies without claiming an observed handoff", () => {
    expect(buildAtcHandoffEstimate(context())).toEqual({
      fromSectorId: "CURRENT",
      fromSectorName: "Current sector",
      toSectorId: "NEXT",
      toSectorName: "Next sector",
      publishedUnit: "PRAHA RADAR",
      primaryFrequencyMhz: 132.89,
      alternateFrequenciesMhz: [134.48],
      distanceNm: 8.5,
      estimatedSeconds: 120,
      confidence: "high",
    });
  });

  it("returns null without an available next-sector prediction", () => {
    expect(buildAtcHandoffEstimate(context({ status: "stale" }))).toBeNull();
    expect(buildAtcHandoffEstimate(context({ nextSector: null }))).toBeNull();
  });

  it("does not present the current sector as a handoff target", () => {
    const value = context();
    expect(buildAtcHandoffEstimate({ ...value, nextSector: { airspace: value.primaryAirspace!, distanceNm: 1, estimatedSeconds: 30, confidence: "medium" } })).toBeNull();
  });
});
