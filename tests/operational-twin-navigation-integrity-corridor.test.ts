import { describe, expect, it } from "vitest";
import type { NavigationIntegrityAnomaly, NavigationIntegrityCurrentResponse } from "@/lib/navigation-integrity/types";
import {
  buildNavigationIntegrityCorridorIntelligence,
  NAVIGATION_INTEGRITY_CORRIDOR_VERSION,
} from "@/lib/operational-twin/navigation-integrity-corridor";
import type { OperationalTwinCorridor } from "@/lib/operational-twin/types";

function corridor(): OperationalTwinCorridor {
  return {
    horizonMinutes: 30,
    stepMinutes: 2,
    mode: "ROUTE_AWARE",
    routeAdherence: "ON_ROUTE",
    routePrecision: "PRECISE",
    maxUncertaintyNm: 6,
    points: [
      { offsetMinutes: 0, at: "2026-10-05T12:00:00.000Z", lat: 49.00, lon: 17.00, altitudeFt: 31_000, trackDeg: 90, uncertaintyNm: 1, mode: "ROUTE_AWARE" },
      { offsetMinutes: 2, at: "2026-10-05T12:02:00.000Z", lat: 49.05, lon: 17.05, altitudeFt: 31_500, trackDeg: 90, uncertaintyNm: 1.4, mode: "ROUTE_AWARE" },
      { offsetMinutes: 4, at: "2026-10-05T12:04:00.000Z", lat: 49.25, lon: 17.25, altitudeFt: 32_000, trackDeg: 90, uncertaintyNm: 1.8, mode: "ROUTE_AWARE" },
      { offsetMinutes: 6, at: "2026-10-05T12:06:00.000Z", lat: 49.45, lon: 17.45, altitudeFt: 32_500, trackDeg: 90, uncertaintyNm: 2.2, mode: "ROUTE_AWARE" },
    ],
    waypoints: [],
  };
}

function anomaly(overrides: Partial<NavigationIntegrityAnomaly> = {}): NavigationIntegrityAnomaly {
  return {
    id: "ni:245:85:3",
    startedAt: "2026-10-05T11:55:00.000Z",
    lastObservedAt: "2026-10-05T12:00:00.000Z",
    endedAt: null,
    cellKeys: ["245:85:3"],
    altitudeBands: [3],
    affectedAircraftCount: 6,
    sampleCount: 20,
    baselineAircraftCount: 8,
    medianNic: 4,
    medianNacP: 5,
    medianNacV: 1,
    baselineMedianNic: 8,
    baselineMedianNacP: 9,
    baselineMedianNacV: 3,
    confidence: "MEDIUM",
    severity: "DEGRADED",
    evidence: {
      independentAircraft: ["a","b","c","d","e","f"],
      localAircraft: 4,
      networkAircraft: 3,
      spatiallyAdjacent: true,
      durationSeconds: 300,
      affectedShare: 0.6,
      reasons: ["correlated integrity degradation"],
      structured: {
        candidateId: "candidate-1",
        generatedAt: "2026-10-05T12:00:00.000Z",
        cellIds: ["245:85:3"],
        altitudeBands: [3],
        affectedAircraftCount: 6,
        independentAircraftCount: 6,
        nearbyNormalAircraftCount: 2,
        current: { nicMedian: 4, nacpMedian: 5, nacvMedian: 1, lowIntegrityShare: 0.6 },
        baseline: {
          nicMedian: 8,
          nacpMedian: 9,
          nacvMedian: 3,
          lowIntegrityShare: 0.1,
          sampleCount: 40,
          aircraftCount: 8,
          maturity: "READY",
          firstObservedAt: "2026-10-05T11:00:00.000Z",
          lastObservedAt: "2026-10-05T12:00:00.000Z",
          timeBucketCount: 6,
        },
        delta: { nic: -4, nacp: -4, nacv: -2, lowIntegrityShare: 0.5 },
        spatial: { affectedCells: 1, coherentCells: 1, adjacencyScore: 1 },
        temporal: { durationSeconds: 300, consecutiveQualifyingEvaluations: 3, hysteresisState: "ACTIVE" },
        source: { localAircraft: 4, networkAircraft: 3, overlapAircraft: 1 },
        rules: [],
        auditCategories: ["LIKELY_VALID_SIGNAL"],
        likelyExplanation: "correlated regional integrity evidence",
      },
    },
    ...overrides,
  };
}

function current(activeAnomalies: NavigationIntegrityAnomaly[], observations = 20): NavigationIntegrityCurrentResponse {
  return {
    generatedAt: "2026-10-05T12:00:00.000Z",
    window: "15m",
    summary: {
      observations,
      aircraft: observations ? 8 : 0,
      cells: observations ? 3 : 0,
      reducedAircraft: observations ? 6 : 0,
      activeAnomalies: activeAnomalies.length,
    },
    cells: [],
    activeAnomalies,
  };
}

describe("Navigation Integrity Corridor V1", () => {
  it("matches active anomaly regions only when sampled cell and altitude band both intersect", () => {
    const result = buildNavigationIntegrityCorridorIntelligence({
      corridor: corridor(),
      current: current([anomaly()]),
      generatedAt: new Date("2026-10-05T12:00:00.000Z"),
    });

    expect(result.version).toBe(NAVIGATION_INTEGRITY_CORRIDOR_VERSION);
    expect(result.status).toBe("AVAILABLE");
    expect(result.intersections).toBe(1);
    expect(result.events[0]).toMatchObject({
      entryOffsetMinutes: 0,
      exitOffsetMinutes: 2,
      altitudeBand: 3,
      sampledPoints: 2,
      severity: "DEGRADED",
      confidence: "MEDIUM",
      affectedAircraftCount: 6,
      localAircraftCount: 4,
      networkAircraftCount: 3,
      baselineMaturity: "READY",
      provenance: "INFERRED",
    });
  });

  it("does not project a horizontal match from an incompatible altitude band", () => {
    const result = buildNavigationIntegrityCorridorIntelligence({
      corridor: corridor(),
      current: current([anomaly({ cellKeys: ["245:85:2"], altitudeBands: [2] })]),
    });
    expect(result.status).toBe("AVAILABLE");
    expect(result.events).toEqual([]);
  });

  it("does not turn a lack of active anomaly intersections into an all-clear state", () => {
    const result = buildNavigationIntegrityCorridorIntelligence({
      corridor: corridor(),
      current: current([]),
    });
    expect(result.status).toBe("AVAILABLE");
    expect(result.intersections).toBe(0);
    expect(result.limitations).toContain("CAUSE_UNKNOWN");
  });

  it("reports insufficient evidence when the current Navigation Integrity snapshot has no observations", () => {
    const result = buildNavigationIntegrityCorridorIntelligence({
      corridor: corridor(),
      current: current([], 0),
    });
    expect(result.status).toBe("INSUFFICIENT");
    expect(result.events).toEqual([]);
  });
});
