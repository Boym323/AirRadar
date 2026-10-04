import { describe, expect, it } from "vitest";
import { buildAirportRunwayFlowIntelligence } from "@/lib/airport-intelligence/v3";
import type { AirportMovement } from "@/lib/server/airport-movements";
import type { AirportOperationsResponse } from "@/lib/server/airport-operations";

function movement(
  flightId: number,
  kind: AirportMovement["movement"],
  observedAt: string,
  runway = "29",
  status: NonNullable<AirportMovement["runway"]>["status"] = "probable",
): AirportMovement {
  return {
    flightId,
    icaoHex: `ABC${flightId.toString().padStart(3, "0")}`,
    callsign: `TEST${flightId}`,
    registration: null,
    movement: kind,
    confidence: "medium",
    airport: "LOWW",
    runway: { designator: runway, status, confidence: "medium" },
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

describe("Airport Live Board V7 runway flow stability", () => {
  it("marks runway flow stable only when both 15-minute windows have strong matching evidence", () => {
    const result = buildAirportRunwayFlowIntelligence(operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29", "reported"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", "29"),
      movement(3, "TAKEOFF", "2026-10-04T08:20:00.000Z", "29"),
      movement(4, "DEPARTURE", "2026-10-04T08:18:00.000Z", "11"),
      movement(5, "LANDING", "2026-10-04T08:14:00.000Z", "29"),
      movement(6, "APPROACH", "2026-10-04T08:10:00.000Z", "29"),
      movement(7, "TAKEOFF", "2026-10-04T08:06:00.000Z", "29"),
      movement(8, "DEPARTURE", "2026-10-04T08:02:00.000Z", "11"),
    ]), "29");

    expect(result.state).toBe("STABLE");
    expect(result.current).toMatchObject({
      runway: "29",
      samples: 4,
      reportedSamples: 1,
      inferredSamples: 3,
      arrivals: { runway: "29", samples: 2 },
      departures: { runway: "11", samples: 2 },
    });
    expect(result.current.share).toBeCloseTo(0.75);
    expect(result.previous.share).toBeCloseTo(0.75);
    expect(result.transition).toBeNull();
    expect(result.windAlignment).toBe("ALIGNED");
  });

  it("detects a supported dominant-runway transition between consecutive windows", () => {
    const result = buildAirportRunwayFlowIntelligence(operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", "29"),
      movement(3, "TAKEOFF", "2026-10-04T08:20:00.000Z", "29"),
      movement(4, "DEPARTURE", "2026-10-04T08:18:00.000Z", "11"),
      movement(5, "LANDING", "2026-10-04T08:14:00.000Z", "11"),
      movement(6, "APPROACH", "2026-10-04T08:10:00.000Z", "11"),
      movement(7, "TAKEOFF", "2026-10-04T08:06:00.000Z", "11"),
      movement(8, "DEPARTURE", "2026-10-04T08:02:00.000Z", "29"),
    ]), "11");

    expect(result.state).toBe("TRANSITIONING");
    expect(result.transition).toEqual({ from: "11", to: "29" });
    expect(result.current.runway).toBe("29");
    expect(result.previous.runway).toBe("11");
    expect(result.windAlignment).toBe("DIFFERENT");
  });

  it("keeps split runway evidence mixed rather than declaring a transition", () => {
    const result = buildAirportRunwayFlowIntelligence(operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", "29"),
      movement(3, "TAKEOFF", "2026-10-04T08:20:00.000Z", "11"),
      movement(4, "DEPARTURE", "2026-10-04T08:18:00.000Z", "11"),
      movement(5, "LANDING", "2026-10-04T08:14:00.000Z", "29"),
      movement(6, "APPROACH", "2026-10-04T08:10:00.000Z", "29"),
      movement(7, "TAKEOFF", "2026-10-04T08:06:00.000Z", "29"),
      movement(8, "DEPARTURE", "2026-10-04T08:02:00.000Z", "11"),
    ]), "29");

    expect(result.state).toBe("MIXED");
    expect(result.current.share).toBeCloseTo(0.5);
    expect(result.transition).toBeNull();
    expect(result.windAlignment).toBe("UNKNOWN");
  });

  it("fails closed when either comparison window lacks three runway-bearing flights", () => {
    const result = buildAirportRunwayFlowIntelligence(operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", "29"),
      movement(3, "TAKEOFF", "2026-10-04T08:20:00.000Z", "29"),
      movement(4, "LANDING", "2026-10-04T08:10:00.000Z", "29"),
      movement(5, "TAKEOFF", "2026-10-04T08:05:00.000Z", "29"),
    ]), "29");

    expect(result.state).toBe("INSUFFICIENT");
    expect(result.current.samples).toBe(3);
    expect(result.previous.samples).toBe(2);
  });

  it("deduplicates a flight to its newest runway-bearing movement inside a window", () => {
    const result = buildAirportRunwayFlowIntelligence(operations([
      movement(1, "LANDING", "2026-10-04T08:29:00.000Z", "29"),
      movement(1, "APPROACH", "2026-10-04T08:22:00.000Z", "11"),
      movement(2, "APPROACH", "2026-10-04T08:25:00.000Z", "29"),
      movement(3, "TAKEOFF", "2026-10-04T08:20:00.000Z", "29"),
      movement(4, "LANDING", "2026-10-04T08:14:00.000Z", "29"),
      movement(5, "APPROACH", "2026-10-04T08:10:00.000Z", "29"),
      movement(6, "TAKEOFF", "2026-10-04T08:06:00.000Z", "29"),
    ]), "29");

    expect(result.current.samples).toBe(3);
    expect(result.current.runway).toBe("29");
    expect(result.current.share).toBe(1);
  });
});
