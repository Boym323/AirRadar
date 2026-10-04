import { describe, expect, it } from "vitest";
import { buildAirportArrivalFlowIntelligence } from "@/lib/airport-intelligence/arrival-flow-v8";
import type { AirportArrivalSequenceSummary } from "@/lib/airport-intelligence/arrival-sequence-v7";
import type { AirportFlowPressureSummary, AirportRunwayFlowIntelligence } from "@/lib/airport-intelligence/v3";

function sequence(etas: Array<{ minutes: number; runway?: string | null }>, totalCandidates = etas.length): AirportArrivalSequenceSummary {
  const base = Date.parse("2026-10-04T20:00:00.000Z");
  const items = etas.map((eta, index) => ({
    position: index + 1,
    icaoHex: `ABC00${index}`,
    label: `ABC00${index}`,
    stage: "INBOUND" as const,
    distanceKm: 30 - index,
    orderBasis: "ETA" as const,
    etaAt: new Date(base + eta.minutes * 60_000).toISOString(),
    etaHorizonMinutes: eta.minutes,
    etaUncertaintyMinutes: 3,
    etaConfidence: "MEDIUM" as const,
    runway: eta.runway ?? null,
    runwayConfidence: eta.runway ? "MEDIUM" as const : null,
  }));
  return {
    version: "airport-live-board-v7",
    generatedAt: "2026-10-04T20:00:00.000Z",
    totalCandidates,
    etaPredicted: items.length,
    runwayPredicted: items.filter((item) => item.runway).length,
    predictionCoverage: totalCandidates ? items.length / totalCandidates : null,
    medianSpacingMinutes: null,
    runway: { designator: null, consistency: "UNKNOWN", share: null, samples: 0 },
    items,
  };
}

function pressure(holdingRecent = 0, goAroundRecent = 0): AirportFlowPressureSummary {
  return {
    trendWindowMinutes: 15,
    exceptionWindowMinutes: 30,
    arrivals: { current: 0, previous: 0, delta: 0, trend: "NO_DATA" },
    departures: { current: 0, previous: 0, delta: 0, trend: "NO_DATA" },
    holdingRecent,
    goAroundRecent,
    pressure: { level: "LOW", score: 0 },
    runway: { designator: null, consistency: "UNKNOWN", share: null, samples: 0 },
  };
}

function runwayFlow(runway: string | null = "28", share: number | null = 0.8, samples = 5): AirportRunwayFlowIntelligence {
  const lane = { runway, share, samples };
  return {
    windowMinutes: 15,
    state: samples >= 3 ? "STABLE" : "INSUFFICIENT",
    current: { ...lane, arrivals: lane, departures: lane, reportedSamples: samples, inferredSamples: 0 },
    previous: { ...lane, arrivals: lane, departures: lane, reportedSamples: samples, inferredSamples: 0 },
    transition: null,
    windFavoredRunway: runway,
    windAlignment: runway ? "ALIGNED" : "UNKNOWN",
  };
}

describe("Airport Live Board V8 arrival flow intelligence", () => {
  it("builds 5/15/30 minute demand windows and detects increasing future demand", () => {
    const result = buildAirportArrivalFlowIntelligence({
      sequence: sequence([{ minutes: 4 }, { minutes: 12 }, { minutes: 18 }, { minutes: 22 }, { minutes: 27 }, { minutes: 29 }]),
      flowPressure: pressure(),
      runwayFlow: runwayFlow(),
    });
    expect(result.demand).toMatchObject({
      within5Minutes: 1,
      within15Minutes: 2,
      within30Minutes: 6,
      between15And30Minutes: 4,
      etaSamples: 6,
      trend: "INCREASING",
    });
    expect(result.evidence).toBe("PUBLIC_STRONG");
  });

  it("marks arrival pressure high when active demand, holding and compression corroborate", () => {
    const result = buildAirportArrivalFlowIntelligence({
      sequence: sequence([
        { minutes: 2, runway: "28" },
        { minutes: 3.5, runway: "28" },
        { minutes: 5, runway: "28" },
        { minutes: 10, runway: "28" },
      ]),
      flowPressure: pressure(1, 1),
      runwayFlow: runwayFlow("28", 0.8, 5),
    });
    expect(result.compression.state).toBe("HIGH");
    expect(result.compression.compressedPairs).toBeGreaterThanOrEqual(2);
    expect(result.pressure.level).toBe("HIGH");
  });

  it("compares predicted runway load with observed receiver runway flow", () => {
    const aligned = buildAirportArrivalFlowIntelligence({
      sequence: sequence([
        { minutes: 5, runway: "28" },
        { minutes: 10, runway: "28" },
        { minutes: 20, runway: "10" },
      ]),
      flowPressure: pressure(),
      runwayFlow: runwayFlow("28", 0.8, 5),
    });
    expect(aligned.predictedRunwayLoad[0]).toMatchObject({ runway: "28", within15Minutes: 2, within30Minutes: 2 });
    expect(aligned.runwayAlignment.state).toBe("ALIGNED");

    const different = buildAirportArrivalFlowIntelligence({
      sequence: sequence([
        { minutes: 5, runway: "28" },
        { minutes: 10, runway: "28" },
        { minutes: 20, runway: "28" },
      ]),
      flowPressure: pressure(),
      runwayFlow: runwayFlow("10", 0.8, 5),
    });
    expect(different.runwayAlignment.state).toBe("DIFFERENT");
  });

  it("fails soft to receiver-only evidence when PUBLIC ETA is absent", () => {
    const empty: AirportArrivalSequenceSummary = {
      ...sequence([], 3),
      etaPredicted: 0,
      runwayPredicted: 0,
      predictionCoverage: 0,
      items: [],
    };
    const result = buildAirportArrivalFlowIntelligence({
      sequence: empty,
      flowPressure: pressure(1, 0),
      runwayFlow: runwayFlow(null, null, 0),
      referenceTime: null,
    });
    expect(result.evidence).toBe("RECEIVER_ONLY");
    expect(result.demand.trend).toBe("NO_DATA");
    expect(result.compression.state).toBe("UNKNOWN");
    expect(result.runwayAlignment.state).toBe("UNKNOWN");
    expect(result.pressure.holding).toBe(1);
  });

  it("uses equal 15-minute buckets for decreasing demand", () => {
    const result = buildAirportArrivalFlowIntelligence({
      sequence: sequence([
        { minutes: 3 }, { minutes: 7 }, { minutes: 10 }, { minutes: 14 }, { minutes: 25 },
      ]),
      flowPressure: pressure(),
      runwayFlow: runwayFlow(),
    });
    expect(result.demand.within15Minutes).toBe(4);
    expect(result.demand.between15And30Minutes).toBe(1);
    expect(result.demand.trend).toBe("DECREASING");
  });
});
