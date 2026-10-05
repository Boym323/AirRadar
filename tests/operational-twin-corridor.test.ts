import { describe, expect, it } from "vitest";
import { buildOperationalTwinCorridor, type OperationalTwinAircraftState } from "@/lib/operational-twin";
import type { RouteIntelligenceV2Snapshot } from "@/lib/route-intelligence";

const now = new Date("2026-10-05T05:00:00.000Z");

function aircraft(overrides: Partial<OperationalTwinAircraftState> = {}): OperationalTwinAircraftState {
  return {
    icaoHex: "ABC123",
    callsign: "TEST123",
    registration: "OK-TST",
    observedAt: now.toISOString(),
    lat: 50,
    lon: 14,
    altitudeFt: 10_000,
    groundSpeedKt: 120,
    trackDeg: 90,
    verticalRateFpm: 1_000,
    onGround: false,
    ...overrides,
  };
}

function route(): RouteIntelligenceV2Snapshot {
  const source = {
    kind: "PUBLISHED_ATS" as const,
    provider: "TEST",
    countryCode: "CZ",
    reference: "TEST-AIP",
    procedureId: null,
    effectiveDate: "2026-10-01",
    airacCycle: null,
    amendment: null,
  };
  const first = {
    id: "leg-a",
    sequence: 1,
    kind: "PUBLISHED_ATS" as const,
    phase: "ENROUTE" as const,
    label: "A1",
    from: { id: "START", name: "START", coordinates: { lat: 50, lon: 14 } },
    to: { id: "FIX1", name: "FIX1", coordinates: { lat: 50, lon: 15 } },
    geometry: { type: "LINE" as const, coordinates: [{ lat: 50, lon: 14 }, { lat: 50, lon: 15 }] },
    source,
    status: "RESOLVED" as const,
    unresolvedReason: null,
  };
  const second = {
    ...first,
    id: "leg-b",
    sequence: 2,
    label: "A2",
    from: first.to,
    to: { id: "FIX2", name: "FIX2", coordinates: { lat: 50, lon: 16 } },
    geometry: { type: "LINE" as const, coordinates: [{ lat: 50, lon: 15 }, { lat: 50, lon: 16 }] },
  };
  return {
    route: {
      id: "route-test",
      status: "RESOLVED",
      elements: [first, second],
      procedureMatches: [],
      sources: [source],
      coverage: {
        ats: { eligibleLegs: 2, matchedLegs: 2, percent: 100 },
        reconstruction: { totalElements: 2, resolvedElements: 2, percent: 100 },
        progress: null,
      },
    },
    dynamic: {
      currentPhase: "ENROUTE",
      currentElement: first,
      previousPoint: first.from,
      nextPoint: first.to,
      distanceToNext: 38,
      crossTrackDeviation: 0.2,
      alongTrackDistance: 0,
      routeAdherence: "ON_ROUTE",
      completedElements: [],
      remainingElements: ["leg-b"],
      routeProgress: 0.1,
      routeProgressPercent: 10,
      precision: "PRECISE",
      progressPrecision: "PRECISE",
    },
    runway: {
      reportedRunway: null,
      inferredRunway: null,
      status: "UNKNOWN",
      conflict: false,
    },
  };
}

describe("Operational Digital Twin V1 corridor", () => {
  it("uses resolved route geometry and emits bounded waypoint estimates", () => {
    const result = buildOperationalTwinCorridor(aircraft(), route(), now);
    expect(result?.mode).toBe("ROUTE_AWARE");
    expect(result?.horizonMinutes).toBe(30);
    expect(result?.stepMinutes).toBe(2);
    expect(result?.points).toHaveLength(16);
    expect(result?.waypoints.map((item) => item.name)).toContain("FIX1");
    expect(result?.points[5]?.lon).toBeGreaterThan(14);
  });

  it("falls back to kinematic projection when route adherence is OFF_ROUTE", () => {
    const offRoute = route();
    offRoute.dynamic.routeAdherence = "OFF_ROUTE";
    const result = buildOperationalTwinCorridor(aircraft(), offRoute, now);
    expect(result?.mode).toBe("KINEMATIC");
    expect(result?.waypoints).toEqual([]);
    expect(result?.points.at(-1)?.lon).toBeGreaterThan(14);
  });

  it("caps vertical-rate extrapolation after ten minutes", () => {
    const result = buildOperationalTwinCorridor(aircraft({ verticalRateFpm: 1_000 }), null, now);
    expect(result?.points.find((point) => point.offsetMinutes === 10)?.altitudeFt).toBe(20_000);
    expect(result?.points.at(-1)?.altitudeFt).toBe(20_000);
  });

  it("grows horizontal uncertainty with horizon", () => {
    const result = buildOperationalTwinCorridor(aircraft(), route(), now);
    expect(result!.points.at(-1)!.uncertaintyNm).toBeGreaterThan(result!.points[0]!.uncertaintyNm);
    expect(result!.maxUncertaintyNm).toBe(result!.points.at(-1)!.uncertaintyNm);
  });

  it("does not project ground or very slow targets", () => {
    expect(buildOperationalTwinCorridor(aircraft({ onGround: true }), route(), now)).toBeNull();
    expect(buildOperationalTwinCorridor(aircraft({ groundSpeedKt: 20 }), route(), now)).toBeNull();
  });
});
