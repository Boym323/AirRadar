import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("retired observed SID/STAR matcher; R11 stays active", () => {
  it("does not reintroduce isolated inferred-procedure classification", () => {
    const dynamic = source("lib/route-intelligence/dynamic.ts");
    expect(dynamic).not.toContain("matchObservedProcedure");
    expect(dynamic).not.toContain("ObservedProcedureInput");
    expect(dynamic).not.toContain("procedureAirportMatches");
    expect(dynamic).not.toContain("PROCEDURE_MATCH_MIN_LEGS");
    expect(source("lib/route-intelligence/index.ts")).not.toContain("matchObservedProcedure");
    expect(source("lib/route-intelligence.ts")).not.toContain("matchObservedProcedure");
  });

  it("keeps active R11 ATS route construction and dynamic progress", () => {
    const dynamic = source("lib/route-intelligence/dynamic.ts");
    const core = source("lib/route-intelligence/v2.ts");
    const hook = source("components/radar/use-selected-route.ts");
    expect(dynamic).toContain("export function analyzeDynamicRoute(");
    expect(core).toContain("dynamic: analyzeDynamicRoute({");
    expect(hook).toContain("analyzePublishedRoute(");
    expect(hook).toContain("toRouteIntelligenceViewDTO(");
    expect(existsSync(new URL("tests/route-intelligence-v2.test.ts", root))).toBe(true);
  });
});
