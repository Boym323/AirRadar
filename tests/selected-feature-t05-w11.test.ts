import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");
describe("T05 and W11 retired without harming R17 and W06", () => {
  it("does not compute projected ATC handoffs but retains containing sectors and published frequencies", () => {
    expect(existsSync(join(root,"lib/atc-context/handoff.ts"))).toBe(false);
    expect(existsSync(join(root,"tests/atc-handoff.test.ts"))).toBe(false);
    const engine=source("lib/atc-context/engine.ts");
    const detail=source("components/aircraft-radar-quick-detail.tsx");
    expect(engine).toContain('const nextSector: AtcContextResult["nextSector"] = null;');
    expect(engine).not.toContain("projectionTimes =");
    expect(engine).not.toContain("for (let nm = 2; nm <= 45;");
    expect(engine).toContain("primaryAirspace: matches[0] ?? null");
    expect(detail).not.toContain("buildAtcHandoffEstimate");
    expect(detail).toContain("publishedFrequenciesMhz");
  });
  it("does not infer weather-avoidance intent while retaining SIGMET context", () => {
    expect(existsSync(join(root,"lib/weather/sigmet-trajectory-deviation.ts"))).toBe(false);
    expect(existsSync(join(root,"tests/sigmet-trajectory-deviation.test.ts"))).toBe(false);
    const app=source("components/airradar-app.tsx");
    const detail=source("components/aircraft-radar-quick-detail.tsx");
    expect(app).not.toContain("detectSigmetTrajectoryDeviation");
    expect(detail).not.toContain("sigmetDeviation");
    expect(app).toContain("aircraftSigmetContext(selectedAircraft, sigmetData)");
    expect(detail).toContain('data-testid="aircraft-sigmet-context"');
    expect(detail).toContain("t.weather.sigmetStaleWarning");
  });
});
