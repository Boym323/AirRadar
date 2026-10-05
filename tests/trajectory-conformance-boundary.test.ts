import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const conformance = readFileSync(join(root, "lib/route-intelligence/conformance.ts"), "utf8");
const corridorHook = readFileSync(join(root, "components/radar/use-route-corridor-intelligence.ts"), "utf8");
const drawer = readFileSync(join(root, "components/aircraft-radar-quick-detail.tsx"), "utf8");

describe("Trajectory Conformance V1 boundaries", () => {
  it("stays a pure projection over existing Route Intelligence and Route Corridor state", () => {
    expect(conformance).toContain("buildTrajectoryConformance");
    expect(conformance).not.toContain("fetch(");
    expect(conformance).not.toContain("EventSource");
    expect(conformance).not.toContain("prisma");
    expect(conformance).not.toContain("FlightIntelligence");
  });

  it("adds no independent stream, timer, persistence or weather dependency", () => {
    expect(corridorHook).toContain("buildTrajectoryConformance");
    expect(corridorHook).not.toContain("new EventSource");
    expect(corridorHook).not.toContain("setInterval");
    expect(corridorHook).not.toContain("/api/intelligence");
    expect(corridorHook).not.toContain("/api/weather");
    expect(conformance).not.toContain("@/lib/weather");
  });

  it("keeps probable direct conservative and route-coverage gated", () => {
    expect(conformance).toContain("directMinimumSkippedElements: 2");
    expect(conformance).toContain("directMinimumSkippedDistanceNm: 10");
    expect(conformance).toContain("offsetDirectMinimumSkippedElements: 3");
    expect(conformance).toContain("offsetDirectMinimumSkippedDistanceNm: 20");
    expect(conformance).toContain("minimumCoveragePercent: 50");
    expect(conformance).toContain('input.corridor.status !== "ON_ROUTE"');
  });

  it("surfaces inferred conformance with explicit product safety wording", () => {
    expect(drawer).toContain("t.routeConformance.statuses[conformance.status]");
    expect(drawer).toContain("t.routeConformance.directSummary");
    expect(drawer).toContain("t.routeConformance.disclaimer");
  });
});
