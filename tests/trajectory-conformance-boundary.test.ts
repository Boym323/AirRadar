import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root=process.cwd();
const read=(file:string)=>readFileSync(join(root,file),"utf8");

describe("P06 Trajectory Conformance removed; R11 selected route retained", () => {
  it("disables the P06 state machine and all radar consumers", () => {
    const app=read("components/airradar-app.tsx");
    const hook=read("components/radar/use-selected-route.ts");
    const panel=read("components/aircraft-radar-quick-detail.tsx");
    const drawer=read("components/radar/radar-drawer-details.tsx");
    const hud=read("components/radar/radar-flight-follow-hud.tsx");
    for(const source of [app,hook,panel,drawer,hud]){
      expect(source).not.toContain("TrajectoryConformance");
      expect(source).not.toContain("buildTrajectoryConformance");
      expect(source).not.toContain("routeConformance");
      expect(source).not.toContain("conformanceDiagnostics");
    }
  });

  it("retains R11 static/dynamic published route and aircraft next waypoint", () => {
    const hook=read("components/radar/use-selected-route.ts");
    const panel=read("components/aircraft-radar-quick-detail.tsx");
    expect(hook).toContain("analyzePublishedRoute(");
    expect(hook).toContain("toRouteIntelligenceViewDTO(");
    expect(panel).toContain("selectedRoute?.routeProgressPercent");
    expect(panel).toContain("SelectedRouteProgressSection");
  });
});
