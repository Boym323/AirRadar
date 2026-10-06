import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modelSource = readFileSync(new URL("../lib/server/airport-terminal-demand-horizon-v9.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/airports/[icao]/operations/route.ts", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");

describe("Airport Live Board V9 Terminal Demand Horizon boundary", () => {
  it("reuses the existing operations refresh and one LOCAL state snapshot", () => {
    expect(routeSource).toContain("getAirportTerminalDemandHorizonV9(airport)");
    expect(modelSource.match(/getSnapshot\(/g)).toHaveLength(1);
    expect(modelSource).toContain('coverage: "local"');
    expect(modelSource).not.toContain("fetch(");
    expect(modelSource).not.toContain("setInterval");
    expect(modelSource).not.toContain("getPrisma");
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(3);
  });

  it("preserves the V8 PUBLIC arrival-flow product and adds V9 separately", () => {
    expect(boardSource).toContain('data-testid="airport-live-board-v8-arrival-flow"');
    expect(boardSource).toContain("buildAirportArrivalFlowIntelligence");
    expect(boardSource).toContain('data-testid="airport-live-board-v9-terminal-horizon"');
    expect(boardSource).toContain('data-terminal-demand-product="airport-live-board-v9"');
  });

  it("keeps the extended horizon explicitly outside ATC/public-prediction semantics", () => {
    expect(modelSource).toContain('"DIRECT_DISTANCE_GROUNDSPEED_ETA"');
    expect(modelSource).toContain('"NOT_PUBLIC_PREDICTION"');
    expect(modelSource).toContain('"NOT_ATC_SEQUENCE"');
    expect(modelSource).toContain('"NO_CAPACITY_OR_DELAY_INFERENCE"');
  });
});
