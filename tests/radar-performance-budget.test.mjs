import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RADAR_PERFORMANCE_SCENARIOS, evaluateRadarPerformanceBaseline } from "../scripts/radar-performance-budget.mjs";

const baselineSource = readFileSync(new URL("../scripts/radar-performance-baseline.mjs", import.meta.url), "utf8");
const ciSource = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const gitignoreSource = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

function passingResult(aircraft) {
  return {
    aircraft,
    webgl: { aircraft },
    dom: { aircraftMarkers: 0, markerHandles: 0, mountedTrafficRows: 24 },
    trafficList: { totalRows: aircraft, renderedRows: 24, virtualized: true },
    animation: {
      frames: 12,
      averageMs: 4,
      maxMs: 12,
      markerWrites: aircraft * 12,
      markerWritesPerSecond: 2000,
      maxActiveJobs: aircraft,
    },
    labelCollision: { runs: 4, averageMs: 5, maxMs: 12 },
    longTasks: { count: 0, maxMs: 0 },
  };
}

describe("radar production performance budgets", () => {
  it("covers baseline, current production, and headroom aircraft densities", () => {
    expect(RADAR_PERFORMANCE_SCENARIOS.map((scenario) => scenario.aircraft)).toEqual([50, 100, 250, 500, 1000, 1600, 2000]);
  });

  it("accepts a healthy synthetic result for every scenario", () => {
    for (const scenario of RADAR_PERFORMANCE_SCENARIOS) {
      expect(evaluateRadarPerformanceBaseline(passingResult(scenario.aircraft), scenario)).toEqual([]);
    }
  });

  it("rejects structural and instrumentation regressions", () => {
    const scenario = RADAR_PERFORMANCE_SCENARIOS.at(-1);
    const result = passingResult(scenario.aircraft);
    result.webgl.aircraft -= 1;
    result.dom.aircraftMarkers += 1;
    result.dom.markerHandles += 1;
    result.dom.mountedTrafficRows = 100;
    result.trafficList.renderedRows = 99;
    result.animation.frames = 0;
    result.animation.markerWrites = 0;
    result.animation.maxActiveJobs = scenario.aircraft + 1;
    result.labelCollision.runs = 0;

    const violations = evaluateRadarPerformanceBaseline(result, scenario);
    expect(violations.some((message) => message.includes("WebGL aircraft"))).toBe(true);
    expect(violations.some((message) => message.includes("DOM aircraft markers"))).toBe(true);
    expect(violations.some((message) => message.includes("HTML marker handles"))).toBe(true);
    expect(violations.some((message) => message.includes("mounted row mismatch"))).toBe(true);
    expect(violations.some((message) => message.includes("mounted traffic rows"))).toBe(true);
    expect(violations.some((message) => message.includes("animation diagnostics"))).toBe(true);
    expect(violations.some((message) => message.includes("marker writes"))).toBe(true);
    expect(violations.some((message) => message.includes("active animation jobs"))).toBe(true);
    expect(violations.some((message) => message.includes("label collision diagnostics"))).toBe(true);
  });

  it("rejects missing, NaN, or infinite instrumentation counters", () => {
    const scenario = RADAR_PERFORMANCE_SCENARIOS.at(-1);
    const invalidValues = [undefined, Number.NaN, Number.POSITIVE_INFINITY];

    for (const invalid of invalidValues) {
      const frames = passingResult(scenario.aircraft);
      frames.animation.frames = invalid;
      expect(evaluateRadarPerformanceBaseline(frames, scenario).some((message) => message.includes("animation frames must be a finite number"))).toBe(true);

      const writes = passingResult(scenario.aircraft);
      writes.animation.markerWrites = invalid;
      expect(evaluateRadarPerformanceBaseline(writes, scenario).some((message) => message.includes("marker writes must be a finite number"))).toBe(true);

      const jobs = passingResult(scenario.aircraft);
      jobs.animation.maxActiveJobs = invalid;
      expect(evaluateRadarPerformanceBaseline(jobs, scenario).some((message) => message.includes("active animation jobs must be a finite number"))).toBe(true);

      const collision = passingResult(scenario.aircraft);
      collision.labelCollision.runs = invalid;
      expect(evaluateRadarPerformanceBaseline(collision, scenario).some((message) => message.includes("label collision runs must be a finite number"))).toBe(true);
    }
  });

  it("disables inherited live network providers in the benchmark server", () => {
    expect(baselineSource).toContain('ADSBLOL_ENABLED: "false"');
    expect(baselineSource).toContain('ADSBHUB_ENABLED: "false"');
  });

  it("models ordinary synthetic aircraft as non-emergency", () => {
    expect(baselineSource).toContain("emergency: null");
    expect(baselineSource).not.toContain('emergency: "none"');
  });

  it("publishes the benchmark summary before returning a failing status", () => {
    expect(ciSource).toContain("benchmark_status=0");
    expect(ciSource).toContain("npm run benchmark:radar || benchmark_status=$?");
    expect(ciSource).toContain('if [[ -f artifacts/radar-performance-baseline.md ]]');
    expect(ciSource).toContain('cat artifacts/radar-performance-baseline.md >> "${GITHUB_STEP_SUMMARY}"');
    expect(ciSource).toContain('exit "${benchmark_status}"');
  });

  it("keeps generated radar baseline reports out of the worktree", () => {
    expect(gitignoreSource).toContain("artifacts/radar-performance-baseline.json");
    expect(gitignoreSource).toContain("artifacts/radar-performance-baseline.md");
  });

  it("bounds each startup health request by the remaining deadline and child exit", () => {
    expect(baselineSource).toContain("const controller = new AbortController()");
    expect(baselineSource).toContain('fetch(`${baseUrl}/api/health`, { signal: controller.signal })');
    expect(baselineSource).toContain('exitPromise.then((exit) => ({ type: "exit", exit }))');
    expect(baselineSource).toContain("const timeout = setTimeout(() => controller.abort(), remainingMs)");
    expect(baselineSource).toContain("if (controller.signal.aborted || Date.now() >= deadline) throw timeoutError()");
  });

  it("keeps hosted-runner timing observations informational instead of gating CI", () => {
    const scenario = RADAR_PERFORMANCE_SCENARIOS.at(-1);
    const result = passingResult(scenario.aircraft);
    result.animation.averageMs = 10_000;
    result.animation.maxMs = 20_000;
    result.animation.markerWritesPerSecond = 1;
    result.labelCollision.averageMs = 10_000;
    result.labelCollision.maxMs = 20_000;
    result.longTasks.count = 999;
    result.longTasks.maxMs = 30_000;

    expect(evaluateRadarPerformanceBaseline(result, scenario)).toEqual([]);
  });
});
