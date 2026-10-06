import { describe, expect, it } from "vitest";
import { buildAirportTerminalOutlook } from "@/lib/airport-intelligence/terminal-outlook-v1";
import type { AirportArrivalFlowIntelligence } from "@/lib/airport-intelligence/arrival-flow-v8";
import type { AirportFlowPressureSummary, AirportRunwayFlowIntelligence } from "@/lib/airport-intelligence/v3";

const arrivalFlow: AirportArrivalFlowIntelligence = {
  version: "airport-live-board-v8",
  referenceTime: "2026-10-06T09:00:00.000Z",
  evidence: "PUBLIC_PARTIAL",
  demand: { within5Minutes: 1, within15Minutes: 3, within30Minutes: 5, between15And30Minutes: 2, etaSamples: 5, trend: "STABLE" },
  pressure: { level: "ELEVATED", score: 8, activeArrivals: 5, holding: 1, goAround: 1 },
  compression: { state: "ELEVATED", minimumSpacingMinutes: 3, medianSpacingMinutes: 5, compressedPairs: 1, samples: 4 },
  queue: { state: "BUILDING", approachOrFinal: 3, holding: 1, reasons: ["arrival_density"] },
  predictedRunwayLoad: [],
  runwayAlignment: { state: "ALIGNED", predictedRunway: "24", predictedShare: 0.7, predictedSamples: 4, observedRunway: "24", observedShare: 0.8, observedSamples: 5 },
};

const pressure: AirportFlowPressureSummary = {
  trendWindowMinutes: 15,
  exceptionWindowMinutes: 30,
  arrivals: { current: 3, previous: 2, delta: 1, trend: "STEADY" },
  departures: { current: 2, previous: 2, delta: 0, trend: "STEADY" },
  holdingRecent: 1,
  goAroundRecent: 1,
  pressure: { level: "ELEVATED", score: 8 },
  runway: { designator: "24", consistency: "STABLE", share: 0.8, samples: 5 },
};

const runwayFlow: AirportRunwayFlowIntelligence = {
  windowMinutes: 15,
  state: "STABLE",
  current: {
    runway: "24", share: 0.8, samples: 5,
    arrivals: { runway: "24", share: 1, samples: 3 },
    departures: { runway: "24", share: 1, samples: 2 },
    reportedSamples: 2, inferredSamples: 3,
  },
  previous: {
    runway: "24", share: 1, samples: 3,
    arrivals: { runway: "24", share: 1, samples: 2 },
    departures: { runway: "24", share: 1, samples: 1 },
    reportedSamples: 1, inferredSamples: 2,
  },
  transition: null,
  windFavoredRunway: "24",
  windAlignment: "ALIGNED",
};

describe("Airport Terminal Outlook V1", () => {
  it("combines existing arrival, pressure and runway evidence without recomputation", () => {
    const outlook = buildAirportTerminalOutlook({ arrivalFlow, flowPressure: pressure, runwayFlow });
    expect(outlook.status).toBe("AVAILABLE");
    expect(outlook.arrivalDemand).toMatchObject({ within5Minutes: 1, within15Minutes: 3, within30Minutes: 5 });
    expect(outlook.runway).toMatchObject({ observed: "24", predicted: "24", alignment: "ALIGNED", flowState: "STABLE" });
    expect(outlook.recentExceptions).toEqual({ holding: 1, goAround: 1 });
  });

  it("preserves explicit operational-context limitations", () => {
    const outlook = buildAirportTerminalOutlook({ arrivalFlow: { ...arrivalFlow, evidence: "RECEIVER_ONLY" }, flowPressure: pressure, runwayFlow });
    expect(outlook.status).toBe("PARTIAL");
    expect(outlook.limitations).toContain("NOT_ATC_CONFIGURATION");
    expect(outlook.limitations).toContain("NO_CAUSAL_INFERENCE");
  });
});
