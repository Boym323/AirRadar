import { describe, expect, it } from "vitest";
import { evaluateNavigationIntegrityConfidenceShadow } from "@/lib/navigation-integrity/shadow";
import type { NavigationIntegrityEvidence } from "@/lib/navigation-integrity/types";

function evidence(overrides: Partial<NavigationIntegrityEvidence> = {}): NavigationIntegrityEvidence {
  return {
    candidateId: "synthetic", generatedAt: "2026-09-28T10:00:00.000Z", cellIds: ["1:1:3", "1:2:3"], altitudeBands: [3],
    affectedAircraftCount: 8, independentAircraftCount: 8, nearbyNormalAircraftCount: 4,
    current: { nicMedian: 6, nacpMedian: 6, nacvMedian: 2, lowIntegrityShare: 0.5 },
    baseline: { nicMedian: 8, nacpMedian: 9, nacvMedian: 3, lowIntegrityShare: 0.05, sampleCount: 40, aircraftCount: 8, maturity: "READY", firstObservedAt: null, lastObservedAt: null, timeBucketCount: 6 },
    delta: { nic: -2, nacp: -3, nacv: -1, lowIntegrityShare: 0.45 },
    spatial: { affectedCells: 2, coherentCells: 2, adjacencyScore: 1 },
    temporal: { durationSeconds: 600, consecutiveQualifyingEvaluations: 3, hysteresisState: "ACTIVE" },
    source: { localAircraft: 8, networkAircraft: 0, overlapAircraft: 0 }, rules: [], auditCategories: [], likelyExplanation: "synthetic",
    ...overrides,
  };
}

describe("navigation integrity shadow confidence", () => {
  it("does not promote aircraft count without degradation", () => {
    const result = evaluateNavigationIntegrityConfidenceShadow(evidence({ delta: { nic: 0, nacp: 0, nacv: 0, lowIntegrityShare: 0 } }), "MEDIUM");
    expect(result.shadowConfidence).toBe("LOW");
    expect(result.reasonCodes).toContain("AIRCRAFT_COUNT_ONLY");
  });

  it("caps immature baseline evidence at LOW", () => {
    const result = evaluateNavigationIntegrityConfidenceShadow(evidence({ baseline: { ...evidence().baseline, maturity: "IMMATURE" } }), "MEDIUM");
    expect(result.shadowConfidence).toBe("LOW");
    expect(result.reasonCodes).toContain("BASELINE_IMMATURE");
  });

  it("keeps strong mature multi-aircraft degradation at HIGH", () => {
    const result = evaluateNavigationIntegrityConfidenceShadow(evidence({
      independentAircraftCount: 12,
      affectedAircraftCount: 12,
      baseline: { ...evidence().baseline, maturity: "STRONG" },
      source: { localAircraft: 12, networkAircraft: 0, overlapAircraft: 0 },
    }), "MEDIUM");
    expect(result.shadowConfidence).toBe("HIGH");
  });

  it("allows strong degradation with a PARTIAL baseline to reach MEDIUM", () => {
    const result = evaluateNavigationIntegrityConfidenceShadow(evidence({ baseline: { ...evidence().baseline, maturity: "PARTIAL" } }), "MEDIUM");
    expect(result.shadowConfidence).toBe("MEDIUM");
  });

  it("can use a mature low-integrity-share delta without inventing median deltas", () => {
    const result = evaluateNavigationIntegrityConfidenceShadow(evidence({ delta: { nic: 0, nacp: 0, nacv: 0, lowIntegrityShare: 0.3 } }), "MEDIUM");
    expect(result.shadowConfidence).toBe("MEDIUM");
    expect(result.reasonCodes).toContain("UNCHANGED_MEDIAN_NOT_DEGRADATION");
  });

  it("keeps a short transient below a sustained equivalent", () => {
    const transient = evaluateNavigationIntegrityConfidenceShadow(evidence({ temporal: { durationSeconds: 30, consecutiveQualifyingEvaluations: 1, hysteresisState: "CANDIDATE" } }), "MEDIUM");
    const sustained = evaluateNavigationIntegrityConfidenceShadow(evidence(), "MEDIUM");
    expect(transient.shadowConfidence).toBe("LOW");
    expect(sustained.shadowConfidence).toBe("MEDIUM");
  });

  it("does not increase confidence at a cell edge without spatial support", () => {
    const result = evaluateNavigationIntegrityConfidenceShadow(evidence({ spatial: { affectedCells: 1, coherentCells: 1, adjacencyScore: 0 } }), "MEDIUM");
    expect(result.shadowConfidence).toBe("LOW");
    expect(result.reasonCodes).toContain("NO_SPATIAL_COHERENCE");
  });

  it("separates severity from confidence inputs", () => {
    const weak = evaluateNavigationIntegrityConfidenceShadow(evidence({ current: { ...evidence().current, nicMedian: 1 } }), "MEDIUM");
    expect(weak.shadowConfidence).toBe("MEDIUM");
  });
});
