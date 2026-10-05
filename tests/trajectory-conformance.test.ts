import { describe, expect, it } from "vitest";
import {
  buildTrajectoryConformance,
  type RouteCorridorSnapshot,
  type RouteIntelligenceV2Snapshot,
  type TrajectoryConformanceTrackerState,
} from "@/lib/route-intelligence";

function element(sequence: number) {
  const fromLon = (sequence - 1) * 0.2;
  const toLon = sequence * 0.2;
  return {
    id: `leg-${sequence}`,
    sequence,
    kind: "PUBLISHED_ATS" as const,
    phase: "EN_ROUTE" as const,
    label: "T709",
    from: { id: `P${sequence - 1}`, name: `P${sequence - 1}`, coordinates: { lat: 0, lon: fromLon } },
    to: { id: `P${sequence}`, name: `P${sequence}`, coordinates: { lat: 0, lon: toLon } },
    geometry: { type: "LINE" as const, coordinates: [{ lat: 0, lon: fromLon }, { lat: 0, lon: toLon }] },
    source: { kind: "PUBLISHED_ATS" as const, provider: "fixture", countryCode: "CZ", reference: "ENR 3.2", procedureId: null, effectiveDate: "2026-10-01", airacCycle: null, amendment: null },
    status: "RESOLVED" as const,
    unresolvedReason: null,
  };
}

function route(currentSequence: number | null, coverage = 100): RouteIntelligenceV2Snapshot {
  const elements = [1, 2, 3, 4, 5].map(element);
  const current = currentSequence === null ? null : elements[currentSequence - 1]!;
  return {
    route: {
      id: "filed:P0 T709 P5",
      status: coverage >= 100 ? "RESOLVED" : "PARTIAL",
      elements,
      procedureMatches: [],
      sources: [elements[0]!.source],
      coverage: {
        ats: { eligibleLegs: 5, matchedLegs: Math.round((coverage / 100) * 5), percent: coverage },
        reconstruction: { totalElements: 5, resolvedElements: Math.round((coverage / 100) * 5), percent: coverage },
        progress: null,
      },
    },
    dynamic: {
      currentPhase: current ? "EN_ROUTE" : "UNKNOWN",
      currentElement: current,
      previousPoint: current?.from ?? null,
      nextPoint: current?.to ?? null,
      distanceToNext: current ? 5 : null,
      crossTrackDeviation: current ? 1 : null,
      alongTrackDistance: current ? 5 : null,
      routeAdherence: current ? "ON_ROUTE" : "UNKNOWN",
      completedElements: current ? elements.filter((item) => item.sequence < current.sequence).map((item) => item.id) : [],
      remainingElements: current ? elements.filter((item) => item.sequence > current.sequence).map((item) => item.id) : elements.map((item) => item.id),
      routeProgress: current ? current.sequence / elements.length : null,
      routeProgressPercent: current ? (current.sequence / elements.length) * 100 : null,
      precision: current ? "PRECISE" : "UNAVAILABLE",
      progressPrecision: current ? "PRECISE" : "UNAVAILABLE",
    },
    runway: { reportedRunway: null, inferredRunway: null, status: "UNKNOWN", conflict: false },
  };
}

function corridor(
  status: RouteCorridorSnapshot["status"],
  crossTrackDeviationNm: number | null,
  trackDeltaDeg: number | null = 5,
): RouteCorridorSnapshot {
  return {
    status,
    confidence: "HIGH",
    progressPercent: 20,
    nextPoint: { id: "P1", name: "P1" },
    distanceToNextNm: 5,
    remainingDistanceNm: 50,
    remainingDistanceComplete: true,
    etaToNextMinutes: 1,
    etaRemainingMinutes: 10,
    crossTrackDeviationNm,
    expectedTrackDeg: 90,
    trackDeltaDeg,
    currentElementId: "leg-1",
    resolvedElements: 5,
    totalElements: 5,
    reconstructionCoveragePercent: 100,
    precision: "PRECISE",
  };
}

function observe(
  tracker: TrajectoryConformanceTrackerState | null,
  observedAt: number,
  currentSequence: number | null,
  status: RouteCorridorSnapshot["status"],
  crossTrackDeviationNm: number | null,
  coverage = 100,
) {
  return buildTrajectoryConformance({
    route: route(currentSequence, coverage),
    corridor: corridor(status, crossTrackDeviationNm),
    observedAt,
  }, tracker);
}

describe("Trajectory Conformance V1", () => {
  it("maps stable corridor observations without inventing events", () => {
    const result = observe(null, 1_000, 1, "ON_ROUTE", 1);
    expect(result.snapshot).toMatchObject({
      status: "ON_ROUTE",
      confidence: "HIGH",
      currentElementId: "leg-1",
      probableDirect: null,
    });
    expect(result.tracker.counters).toMatchObject({
      observations: 1,
      deviationTransitions: 0,
      probableDirects: 0,
    });
  });

  it("moves through DEVIATING -> REJOINING -> ON_ROUTE with confirmed recovery", () => {
    const deviating = observe(null, 10_000, 1, "DEVIATING", 12);
    expect(deviating.snapshot.status).toBe("DEVIATING");

    const rejoining = observe(deviating.tracker, 12_000, 1, "ON_ROUTE", 1);
    expect(rejoining.snapshot.status).toBe("REJOINING");
    expect(rejoining.tracker.counters.rejoinCandidates).toBe(1);

    const recovered = observe(rejoining.tracker, 17_000, 1, "ON_ROUTE", 1);
    expect(recovered.snapshot.status).toBe("ON_ROUTE");
    expect(recovered.snapshot.evidence).toContain("REJOIN_CONFIRMED");
    expect(recovered.tracker.counters.rejoinConfirmed).toBe(1);
  });

  it("detects a probable direct only after prior deviation and a meaningful forward route jump", () => {
    const deviating = observe(null, 10_000, 1, "DEVIATING", 14);
    const direct = observe(deviating.tracker, 15_000, 4, "ON_ROUTE", 1);

    expect(direct.snapshot.status).toBe("PROBABLE_DIRECT");
    expect(direct.snapshot.confidence).toBe("HIGH");
    expect(direct.snapshot.probableDirect).toMatchObject({
      fromElementId: "leg-1",
      toElementId: "leg-4",
      rejoinedAt: "P3",
      skippedElementIds: ["leg-2", "leg-3"],
      skippedElements: 2,
    });
    expect(direct.snapshot.probableDirect?.skippedDistanceNm).toBeGreaterThan(20);
    expect(direct.tracker.counters).toMatchObject({ directCandidates: 1, probableDirects: 1 });
  });

  it("holds probable direct briefly so a valid transition is visible to the product layer", () => {
    const deviating = observe(null, 10_000, 1, "DEVIATING", 14);
    const direct = observe(deviating.tracker, 15_000, 4, "ON_ROUTE", 1);
    const held = observe(direct.tracker, 25_000, 4, "ON_ROUTE", 1);
    expect(held.snapshot.status).toBe("PROBABLE_DIRECT");
    expect(held.snapshot.evidence).toContain("DIRECT_HOLD");

    const expired = observe(held.tracker, 46_000, 4, "ON_ROUTE", 1);
    expect(expired.snapshot.status).toBe("ON_ROUTE");
    expect(expired.snapshot.probableDirect).toBeNull();
  });

  it("rejects ordinary forward progress as a direct candidate without prior offset/deviation evidence", () => {
    const first = observe(null, 10_000, 1, "ON_ROUTE", 1);
    const jump = observe(first.tracker, 15_000, 4, "ON_ROUTE", 1);
    expect(jump.snapshot.status).toBe("ON_ROUTE");
    expect(jump.snapshot.probableDirect).toBeNull();
    expect(jump.tracker.counters).toMatchObject({
      directCandidates: 1,
      probableDirects: 0,
      rejectedJumpCandidates: 1,
    });
  });

  it("uses stricter evidence for a probable direct from OFFSET", () => {
    const offset = observe(null, 10_000, 1, "OFFSET", 6);
    const twoSkipped = observe(offset.tracker, 15_000, 4, "ON_ROUTE", 1);
    expect(twoSkipped.snapshot.status).toBe("ON_ROUTE");
    expect(twoSkipped.snapshot.probableDirect).toBeNull();

    const offsetAgain = observe(twoSkipped.tracker, 20_000, 1, "OFFSET", 6);
    const threeSkipped = observe(offsetAgain.tracker, 25_000, 5, "ON_ROUTE", 1);
    expect(threeSkipped.snapshot.status).toBe("PROBABLE_DIRECT");
    expect(threeSkipped.snapshot.confidence).toBe("MEDIUM");
    expect(threeSkipped.snapshot.probableDirect?.skippedElements).toBe(3);
  });

  it("fails closed to ROUTE_UNCERTAIN when route coverage is too low", () => {
    const result = observe(null, 10_000, 1, "ON_ROUTE", 1, 40);
    expect(result.snapshot.status).toBe("ROUTE_UNCERTAIN");
    expect(result.snapshot.confidence).toBe("LOW");
    expect(result.snapshot.evidence).toContain("ROUTE_COVERAGE_LOW");
    expect(result.tracker.counters.routeUncertainObservations).toBe(1);
  });

  it("returns ROUTE_UNCERTAIN when dynamic route matching has no current element", () => {
    const result = observe(null, 10_000, null, "ROUTE_UNKNOWN", null);
    expect(result.snapshot.status).toBe("ROUTE_UNCERTAIN");
    expect(result.snapshot.evidence).toContain("CURRENT_ELEMENT_MISSING");
  });
});
