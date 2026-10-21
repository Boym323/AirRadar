import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(new URL("../" + relativePath, import.meta.url), "utf8");
const report = JSON.parse(read("docs/audits/PR1096-RELEASE-READINESS-2026-10-21.json")) as {
  selection: {keep:number;remove:number;sourceAnchors:number};
  anchors: Record<string,string[]>;
  releasePolicy: {readyToMerge:boolean;readyToDeploy:boolean};
};
const selection = JSON.parse(read("docs/audits/SELECTED-FEATURE-CURRENT-2026-10-21.json")) as {
  count:number;items:Array<{id:string;decision:"KEEP"|"REMOVE"}>;
};

describe("PR1096 per-feature KEEP anchors and release review", () => {
  it("maps all 79 KEEP IDs to individual source entrypoints without changing 99 REMOVE decisions", () => {
    const keep = selection.items.filter(x => x.decision === "KEEP").map(x=>x.id);
    expect(selection.count).toBe(178);
    expect(report.selection).toMatchObject({keep:79,remove:99,sourceAnchors:79});
    expect(keep).toHaveLength(79);
    expect(Object.keys(report.anchors).sort()).toEqual(keep.sort());
  });

  it.each(Object.entries(report.anchors))("keeps %s individually traceable to source", (_id, paths) => {
    expect(paths.length).toBeGreaterThan(0);
    for(const path of paths) expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(true);
  });

  it("keeps core ingress, route calculation, weather radar and notification wiring", () => {
    expect(read("lib/server/aircraft-state.ts")).toContain("this.networkProvider.start()");
    expect(read("lib/server/aircraft-state.ts")).toContain("recordAircraftSnapshot(");
    expect(read("app/api/stream/route.ts")).toContain("new SseDeltaEncoder()");
    expect(read("components/radar/use-selected-route.ts")).toContain("analyzePublishedRoute(");
    expect(read("app/api/weather/radar/frames/route.ts")).toContain("defaultWeatherRadarProvider");
    expect(read("lib/server/aircraft-state.ts")).toContain("getAlertDeliveryWorker().start()");
  });

  it("does not restore orphan styles for retired airport network/ATC detail UIs", () => {
    for (const path of ["components/atc-sector-detail.module.css", "components/live-airport-network.module.css"])
      expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(false);
  });

  it("does not treat green CI alone as authorization to merge/deploy", () => {
    expect(report.releasePolicy.readyToMerge).toBe(false);
    expect(report.releasePolicy.readyToDeploy).toBe(false);
  });
});
