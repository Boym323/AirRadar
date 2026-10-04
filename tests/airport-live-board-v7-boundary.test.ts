import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const intelligenceSource = readFileSync(new URL("../lib/airport-intelligence/v3.ts", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const liveTrafficSource = readFileSync(new URL("../components/airport-live-traffic-controller.ts", import.meta.url), "utf8");

describe("Airport Live Board V7 boundary", () => {
  it("keeps runway stability a pure projection over the bounded operations snapshot", () => {
    expect(intelligenceSource).toContain("buildAirportRunwayFlowIntelligence");
    expect(intelligenceSource).toContain("AIRPORT_LIVE_BOARD_RUNWAY_FLOW_WINDOW_MS = 15 * 60_000");
    expect(intelligenceSource).toContain("AIRPORT_LIVE_BOARD_RUNWAY_FLOW_MIN_SAMPLES = 3");
    expect(intelligenceSource).toContain("AIRPORT_LIVE_BOARD_RUNWAY_FLOW_STABLE_SHARE = 0.75");
    expect(intelligenceSource).not.toContain("getPrisma");
    expect(intelligenceSource).not.toContain("fetch(");
    expect(intelligenceSource).not.toContain("new EventSource");
  });

  it("does not add another request or aircraft stream", () => {
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(2);
    expect(liveTrafficSource.match(/new EventSource\(/g)).toHaveLength(1);
    expect(boardSource).not.toContain("fetch(");
    expect(boardSource).not.toContain("new EventSource");
  });

  it("renders the V7 runway-flow contract without replacing V6 pressure", () => {
    expect(boardSource).toContain('data-product="airport-live-board-v7"');
    expect(boardSource).toContain("buildAirportFlowPressureSummary(flow, operations)");
    expect(boardSource).toContain("buildAirportRunwayFlowIntelligence(operations, runway.windFavoredRunway)");
    expect(boardSource).toContain('data-testid="airport-live-board-v6-pressure"');
    expect(boardSource).toContain('data-testid="airport-live-board-v7-runway-flow"');
    expect(boardSource).toContain("liveBoardV7Disclaimer");
  });
});
