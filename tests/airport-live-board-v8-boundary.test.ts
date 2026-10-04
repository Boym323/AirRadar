import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modelSource = readFileSync(new URL("../lib/airport-intelligence/arrival-flow-v8.ts", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const liveTrafficSource = readFileSync(new URL("../components/airport-live-traffic-controller.ts", import.meta.url), "utf8");

describe("Airport Live Board V8 boundary", () => {
  it("keeps Arrival Flow Intelligence a pure projection over V7 and receiver evidence", () => {
    expect(modelSource).toContain("buildAirportArrivalFlowIntelligence");
    expect(modelSource).toContain("within5Minutes");
    expect(modelSource).toContain("within15Minutes");
    expect(modelSource).toContain("within30Minutes");
    expect(modelSource).toContain("predictedRunwayLoad");
    expect(modelSource).not.toContain("fetch(");
    expect(modelSource).not.toContain("getPrisma");
    expect(modelSource).not.toContain("process.env");
  });

  it("adds no request, timer, stream, route, or persistence path", () => {
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(3);
    expect(controllerSource.match(/setTimeout\(/g)).toHaveLength(1);
    expect(liveTrafficSource.match(/new EventSource\(/g)).toHaveLength(1);
    expect(boardSource).not.toContain("fetch(");
    expect(boardSource).not.toContain("new EventSource");
  });

  it("renders V8 while preserving V6 and both V7 panels", () => {
    expect(boardSource).toContain('data-product="airport-live-board-v8"');
    expect(boardSource).toContain('data-testid="airport-live-board-v6-pressure"');
    expect(boardSource).toContain('data-testid="airport-live-board-v7-runway-flow"');
    expect(boardSource).toContain('data-testid="airport-live-board-v7-arrival-sequence"');
    expect(boardSource).toContain('data-testid="airport-live-board-v8-arrival-flow"');
    expect(boardSource).toContain("buildAirportArrivalFlowIntelligence");
  });

  it("keeps predicted-vs-observed runway comparison evidence-gated", () => {
    expect(modelSource).toContain("predictedComparable");
    expect(modelSource).toContain("observedComparable");
    expect(modelSource).toContain("predictedTop!.runway === observedRunway");
    expect(modelSource).toContain('state: runwayAlignment');
  });
});
