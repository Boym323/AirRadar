import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const queueSource = readFileSync(new URL("../lib/airport-intelligence/approach-queue-v8.ts", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const liveTrafficSource = readFileSync(new URL("../components/airport-live-traffic-controller.ts", import.meta.url), "utf8");

describe("Airport Live Board V8 approach queue boundary", () => {
  it("keeps queue intelligence a pure projection over the V7 arrival sequence", () => {
    expect(queueSource).toContain("buildAirportApproachQueueIntelligence");
    expect(queueSource).toContain("AIRPORT_LIVE_BOARD_V8_COMPRESSED_GAP_MINUTES = 4");
    expect(queueSource).toContain("AIRPORT_LIVE_BOARD_V8_BUILDING_MEDIAN_MINUTES = 6");
    expect(queueSource).toContain("AIRPORT_LIVE_BOARD_V8_MIN_ETA_SAMPLES = 3");
    expect(queueSource).not.toContain("fetch(");
    expect(queueSource).not.toContain("getPrisma");
    expect(queueSource).not.toContain("new EventSource");
  });

  it("adds no request, timer, stream, API or persistence path", () => {
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(3);
    expect(controllerSource.match(/setTimeout\(/g)).toHaveLength(1);
    expect(liveTrafficSource.match(/new EventSource\(/g)).toHaveLength(1);
    expect(boardSource).not.toContain("fetch(");
    expect(boardSource).not.toContain("new EventSource");
    expect(queueSource).not.toContain("/api/");
  });

  it("keeps V7 arrival/runway intelligence and renders the V8 queue contract", () => {
    expect(boardSource).toContain('data-product="airport-live-board-v8"');
    expect(boardSource).toContain("buildAirportArrivalSequence");
    expect(boardSource).toContain('data-testid="airport-live-board-v7-arrival-sequence"');
    expect(boardSource).toContain("buildAirportRunwayFlowIntelligence");
    expect(boardSource).toContain('data-testid="airport-live-board-v7-runway-flow"');
    expect(boardSource).toContain("buildAirportApproachQueueIntelligence(arrivalSequence)");
    expect(boardSource).toContain('data-testid="airport-live-board-v8-approach-queue"');
    expect(boardSource).toContain("liveBoardV8QueueDisclaimer");
  });

  it("avoids ATC or safety semantics in the queue state model", () => {
    expect(queueSource).not.toContain("separation");
    expect(queueSource).not.toContain("capacity");
    expect(queueSource).not.toContain("safe");
    expect(queueSource).not.toContain("delay");
  });
});
