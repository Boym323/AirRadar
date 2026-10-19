import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const board = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const arrival = readFileSync(new URL("../lib/airport-intelligence/arrival-flow-v8.ts", import.meta.url), "utf8");
const terminal = readFileSync(new URL("../lib/server/airport-terminal-demand-horizon-v9.ts", import.meta.url), "utf8");

describe("Slim Airport Live Board V8/V9", () => {
  it("keeps only bounded arrivals, operational pressure and descriptive queue in V8", () => {
    expect(board).toContain('data-testid="airport-live-board-v8-arrival-flow"');
    expect(board).toContain("arrivalFlow.demand.within30Minutes");
    expect(board).toContain("arrivalFlow.pressure.level");
    expect(board).toContain("arrivalFlow.queue.state");
    expect(board).not.toContain("airport-live-board-v8-runway-load");
    expect(arrival).toContain("predictedComparable");
  });

  it("retains a distinct local-only V9 demand without tracking or public ETA blending", () => {
    expect(board).toContain('data-testid="airport-live-board-v9-terminal-horizon"');
    expect(board).toContain('data-terminal-demand-product="airport-live-board-v9"');
    expect(board).toContain("terminalDemandHorizon.demand.within30Minutes");
    expect(board).not.toContain("airport-live-v9-horizon-list");
    expect(terminal).toContain("NOT_PUBLIC_PREDICTION");
    expect(terminal).toContain("LOCAL_RECEIVER_ONLY");
  });

  it("retires the additional D2–D4 explanation products without extra requests or losing canonical runway/traffic", () => {
    expect(board).not.toContain("buildAirportRunwayChangeEvidenceD2");
    expect(board).not.toContain("buildAirportApproachEvidenceD3");
    expect(board).not.toContain("buildAirportContextD4");
    expect(board).toContain("buildAirportRunwayIntelligence");
    expect(board).toContain("buildAirportCorrelatedTrafficSnapshot");
    expect(board).toContain("buildAirportArrivalSequence");
    expect(board).not.toContain("fetch(");
  });
});
