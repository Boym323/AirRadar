import { describe, expect, it } from "vitest";
import {
  buildAirportFlowPressureSummary,
  type AirportJourneyFlowSummary,
} from "@/lib/airport-intelligence/v3";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";

function movement(
  flightId: number,
  kind: AirportMovement["movement"],
  observedAt: string,
  runway: string | null = "29",
): AirportMovement {
  return {
    flightId,
    icaoHex: `ABC${flightId.toString().padStart(3, "0")}`,
    callsign: `TEST${flightId}`,
    registration: null,
    movement: kind,
    confidence: "medium",
    airport: "LOWW",
    runway: runway ? { designator: runway, status: "probable", confidence: "medium" } : null,
    observedAt,
    evidence: [],
  };
}

function operations(recentMovements: AirportMovement[]): AirportOperationsResponse {
  return {
    airport: { icao: "LOWW", name: "Vienna" },
    generatedAt: "2026-10-04T08:30:00.000Z",
    window: "24h",
    provenance: "INFERRED",
    complete: true,
    truncated: false,
    activity: "BUSY",
    likelyRunway: { designator: "29", confidence: "high", sampleCount: 7 },
    arrivals: [],
    departures: [],
    approaches: [],
    recentMovements,
    runwayUsage: [],
    wind: [],
    goArounds: [],
    holding: [],
    diagnostics: { flightsExamined: 20, positionsExamined: 400, queryDurationMs: 12 },
  };
}

function flow(overrides: Partial<AirportJourneyFlowSummary> = {}): AirportJourneyFlowSummary {
  return {
    inbound: 4,
    outbound: 3,
    final: 2,
    holding: 1,
    goAround: 0,
    initialClimb: 1,
    correlated: 6,
    liveOnly: 1,
    routeConfirmed: 5,
    routeConflicts: 1,
    attention: [],
    ...overrides,
  };
}

describe("Airport Live Board V6 flow pressure", () => {
  it("compares consecutive 15-minute movement windows and derives conservative pressure", () => {
    const result = buildAirportFlowPressureSummary(flow(), operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", "29"),
      movement(3, "LANDING", "2026-10-04T08:20:00.000Z", "29"),
      movement(4, "TAKEOFF", "2026-10-04T08:19:00.000Z", "11"),
      movement(5, "HOLDING", "2026-10-04T08:18:00.000Z", null),
      movement(6, "APPROACH", "2026-10-04T08:10:00.000Z", "29"),
      movement(7, "DEPARTURE", "2026-10-04T08:12:00.000Z", "29"),
      movement(8, "TAKEOFF", "2026-10-04T08:08:00.000Z", "29"),
      movement(9, "DEPARTURE", "2026-10-04T08:03:00.000Z", "11"),
      movement(10, "GO_AROUND", "2026-10-04T08:10:00.000Z", "29"),
    ]));

    expect(result.arrivals).toEqual({ current: 3, previous: 1, delta: 2, trend: "RISING" });
    expect(result.departures).toEqual({ current: 1, previous: 3, delta: -2, trend: "FALLING" });
    expect(result.holdingRecent).toBe(1);
    expect(result.goAroundRecent).toBe(1);
    expect(result.pressure).toEqual({ level: "HIGH", score: 13 });
    expect(result.runway).toMatchObject({
      designator: "29",
      consistency: "STABLE",
      samples: 9,
    });
    expect(result.runway.share).toBeCloseTo(7 / 9);
  });

  it("treats a one-movement delta as steady and requires three runway samples", () => {
    const result = buildAirportFlowPressureSummary(flow({
      inbound: 1,
      outbound: 1,
      final: 0,
      holding: 0,
      routeConflicts: 0,
    }), operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", null),
      movement(3, "LANDING", "2026-10-04T08:10:00.000Z", null),
    ]));

    expect(result.arrivals).toEqual({ current: 2, previous: 1, delta: 1, trend: "STEADY" });
    expect(result.runway).toEqual({
      designator: "29",
      consistency: "UNKNOWN",
      share: 1,
      samples: 1,
    });
    expect(result.pressure.level).toBe("LOW");
  });

  it("marks runway evidence mixed when no runway reaches 75 percent in the recent window", () => {
    const result = buildAirportFlowPressureSummary(flow(), operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", "29"),
      movement(3, "TAKEOFF", "2026-10-04T08:20:00.000Z", "11"),
      movement(4, "DEPARTURE", "2026-10-04T08:16:00.000Z", "11"),
    ]));

    expect(result.runway).toEqual({
      designator: "11",
      consistency: "MIXED",
      share: 0.5,
      samples: 4,
    });
  });

  it("keeps live pressure available when the bounded operations snapshot is unavailable", () => {
    const result = buildAirportFlowPressureSummary(flow({
      inbound: 2,
      outbound: 1,
      final: 1,
      holding: 1,
      goAround: 1,
      routeConflicts: 0,
    }), null);

    expect(result.arrivals.trend).toBe("NO_DATA");
    expect(result.departures.trend).toBe("NO_DATA");
    expect(result.runway.consistency).toBe("UNKNOWN");
    expect(result.pressure).toEqual({ level: "ELEVATED", score: 8 });
  });
});
