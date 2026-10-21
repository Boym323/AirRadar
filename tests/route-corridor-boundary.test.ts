import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (name: string) => readFileSync(join(root, name), "utf8");

describe("R11 route rendering without retired P05/P06 intelligence", () => {
  it("retains bounded route lookup and published ATS geometry for the map", () => {
    const hook = read("components/radar/use-selected-route.ts");
    const app = read("components/airradar-app.tsx");
    expect(hook).toContain("/api/navigation/data?ids=");
    expect(hook).toContain("analyzePublishedRoute(");
    expect(hook).toContain("toRouteIntelligenceViewDTO(");
    expect(app).toContain("useSelectedRoute(selectedAircraft)");
    expect(app).toContain("createRouteIntelligenceGeoJSON(selectedRoute.route)");
    expect(app).toContain("ROUTE_V2_COMPLETED_LAYER_ID");
    expect(app).toContain("!routeIntelligenceActiveRef.current");
    const api = read("app/api/navigation/data/route.ts");
    expect(api).toContain("slice(0, 24)");
    expect(api).toContain("chunks(requestedIdentifiers.ids, 8)");
  });

  it("keeps basic R11 next waypoint and progress, but no corridor/deviation inference", () => {
    const hook = read("components/radar/use-selected-route.ts");
    const detail = read("components/aircraft-radar-quick-detail.tsx");
    const followHud = read("components/radar/radar-flight-follow-hud.tsx");
    expect(detail).toContain('data-testid="selected-route-progress"');
    expect(detail).toContain("route.routeProgressPercent");
    expect(detail).toContain("route.nextPoint");
    expect(followHud).toContain("route?.nextPoint?.name");
    for (const code of [hook,detail,followHud,read("components/airradar-app.tsx")]) {
      expect(code).not.toContain("buildRouteCorridorIntelligence(");
      expect(code).not.toContain("buildTrajectoryConformance(");
      expect(code).not.toContain("conformance={");
    }
  });

  it("retires the independent P05/P06 source and tests", () => {
    for (const name of [
      "lib/route-intelligence/corridor.ts",
      "lib/route-intelligence/conformance.ts",
      "components/radar/use-route-corridor-intelligence.ts",
      "tests/route-corridor-intelligence.test.ts",
      "tests/trajectory-conformance.test.ts",
    ]) expect(existsSync(join(root,name)), name).toBe(false);
    expect(read("lib/route-intelligence/index.ts")).not.toContain("buildTrajectoryConformance");
    expect(read("lib/route-intelligence.ts")).not.toContain("buildRouteCorridorIntelligence");
    const featureRegistry = JSON.parse(read("docs/features.registry.json")) as { features:Array<{id:string}> };
    expect(featureRegistry.features.some(x=>x.id==="trajectory-conformance")).toBe(false);
  });
  it("keeps legacy runway inference and SID/STAR applicability logic out of the retained R11 route path", () => {
    for (const path of [
      "lib/route-intelligence/runway-context.ts",
      "tests/runway-context.test.ts",
      "lib/intelligence/types.ts",
    ]) expect(existsSync(join(root, path)), path).toBe(false);
    const facade = read("lib/route-intelligence.ts");
    const engine = read("lib/route-intelligence/index.ts");
    const v2 = read("lib/route-intelligence/v2.ts");
    const contracts = read("lib/route-intelligence/contracts.ts");
    for (const moduleText of [facade, engine]) expect(moduleText).not.toContain('from "./runway-context"');
    expect(facade).not.toContain('from "./route-intelligence/runway-context"');
    expect(v2).toContain('import { createRunwayContext } from "./contracts"');
    expect(contracts).toContain("export function createRunwayContext(");
    expect(existsSync(join(root, "tests/route-intelligence-contracts.test.ts"))).toBe(true);
  });
});
