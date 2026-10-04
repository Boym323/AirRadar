import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const intelligenceSource = readFileSync(new URL("../lib/airport-intelligence/v3.ts", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const liveTrafficSource = readFileSync(new URL("../components/airport-live-traffic-controller.ts", import.meta.url), "utf8");

describe("Airport Live Board V6 boundary", () => {
  it("keeps Flow Trend / Pressure as a pure projection over existing snapshots", () => {
    expect(intelligenceSource).toContain("buildAirportFlowPressureSummary");
    expect(intelligenceSource).toContain("AIRPORT_LIVE_BOARD_FLOW_TREND_WINDOW_MS = 15 * 60_000");
    expect(intelligenceSource).toContain("AIRPORT_LIVE_BOARD_EXCEPTION_WINDOW_MS = 30 * 60_000");
    expect(intelligenceSource).not.toContain("getPrisma");
    expect(intelligenceSource).not.toContain("fetch(");
    expect(intelligenceSource).not.toContain("new EventSource");
  });

  it("keeps V6 pure while the later V7 controller owns three bounded reads", () => {
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(3);
    expect(liveTrafficSource.match(/new EventSource\(/g)).toHaveLength(1);
    expect(boardSource).not.toContain("fetch(");
    expect(boardSource).not.toContain("new EventSource");
  });

  it("keeps the V6 pressure contract inside the V8 product", () => {
    expect(boardSource).toContain('data-product="airport-live-board-v8"');
    expect(boardSource).toContain("buildAirportJourneyFlowSummary");
    expect(boardSource).toContain("buildAirportFlowPressureSummary(flow, operations)");
    expect(boardSource).toContain('data-testid="airport-live-board-v6-pressure"');
    expect(boardSource).toContain("liveBoardV6Disclaimer");
  });
});
