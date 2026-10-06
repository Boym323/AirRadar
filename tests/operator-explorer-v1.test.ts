import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operatorTrafficShare } from "@/components/operator-explorer-metrics";

const page = readFileSync(new URL("../app/operators/page.tsx", import.meta.url), "utf8");
const explorer = readFileSync(new URL("../components/operator-explorer.tsx", import.meta.url), "utf8");
const trafficServer = readFileSync(new URL("../lib/server/statistics-traffic.ts", import.meta.url), "utf8");

describe("Airline & Operator Explorer V1", () => {
  it("keeps airline and operator rankings separate", () => {
    expect(explorer).toContain('tab === "airlines"');
    expect(explorer).toContain("data?.topAirlines");
    expect(explorer).toContain("data?.topOperators");
    expect(explorer).not.toContain("airlineToOperator");
    expect(page).toContain("<OperatorExplorer />");
  });

  it("calculates percentages only against a valid observed-flight total", () => {
    expect(operatorTrafficShare(18, 100)).toBe(18);
    expect(operatorTrafficShare(18, null)).toBeNull();
    expect(operatorTrafficShare(18, 0)).toBeNull();
  });

  it("uses one bounded traffic request per range with no subject fan-out", () => {
    expect(explorer).toContain('const RANGES: StatisticsTrafficRange[] = ["today", "7d", "30d"]');
    expect(explorer.match(/fetch\(/g)).toHaveLength(1);
    expect(explorer).toContain('fetch("/api/statistics/traffic?range=" + range');
    expect(explorer).not.toContain("/api/operators");
    expect(explorer).not.toContain("/api/airlines");
    expect(trafficServer).toContain("schema.Flight");
    expect(trafficServer).not.toContain("schema.FlightPosition");
  });
});
