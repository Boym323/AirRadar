import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const board = file("components/airport-operations-board.tsx");
const controller = file("components/airport-operations-controller.ts");
const runway = file("lib/airport-intelligence/runway-change-evidence-d2.ts");
const approach = file("lib/airport-intelligence/approach-evidence-d3.ts");
const context = file("lib/airport-intelligence/airport-context-d4.ts");
const horizon = file("lib/server/airport-terminal-demand-horizon-v9.ts");

describe("D5 airport intelligence release boundaries", () => {
  it("keeps a single existing airport controller refresh and single aircraft stream", () => {
    expect(controller.match(/fetch\(/g)).toHaveLength(3);
    for (const source of [runway, approach, context]) {
      expect(source).not.toMatch(/fetch\s*\(|setInterval\s*\(|getPrisma\s*\(/);
      expect(source).not.toContain("getAircraftStateService");
      expect(source).not.toContain("EventSource");
    }
  });
  it("adds all D2-D4 evidence to existing Live Board without duplicating V8/V9", () => {
    for (const testId of [
      "airport-d2-runway-evidence", "airport-d3-approach-evidence",
      "airport-d4-operational-context",
      "airport-live-board-v8-arrival-flow", "airport-live-board-v9-terminal-horizon",
    ]) expect(board).toContain(`data-testid="${testId}"`);
    expect(board).toContain("buildAirportArrivalFlowIntelligence");
    expect(board).toContain("buildAirportRunwayFlowIntelligence");
  });
  it("preserves public graduation and honest ground truth boundaries", () => {
    expect(runway).toContain("PREDICTED_DIVERGENCE");
    expect(runway).toContain("INSUFFICIENT_INDEPENDENT_EVIDENCE");
    expect(approach).toContain("OBSERVED_CORRELATED_MOVEMENT");
    expect(approach).toContain("FRESH_LIVE_STAGE_ONLY");
    expect(context).toContain("NO_ATC_CLEARANCE_EVIDENCE");
    expect(context).toContain('atc: "NOT_CORRELATED"');
    expect(horizon).toContain('relation !== "TOWARD"');
    for (const source of [runway, approach, context]) {
      expect(source).not.toMatch(/process\.env|\.write\(|promote|PUBLIC_ACTIVE/);
    }
  });
});
