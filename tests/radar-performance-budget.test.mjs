import { describe, expect, it } from "vitest";
import { RADAR_PERFORMANCE_SCENARIOS, evaluateRadarPerformanceBaseline } from "../scripts/radar-performance-budget.mjs";

function passingResult(aircraft) {
  return {
    aircraft,
    dom: { aircraftMarkers: aircraft, markerHandles: aircraft, mountedTrafficRows: 24 },
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
  it("covers 50, 100, 250, and 500 aircraft", () => {
    expect(RADAR_PERFORMANCE_SCENARIOS.map((scenario) => scenario.aircraft)).toEqual([50, 100, 250, 500]);
  });

  it("accepts a healthy synthetic result for every scenario", () => {
    for (const scenario of RADAR_PERFORMANCE_SCENARIOS) {
      expect(evaluateRadarPerformanceBaseline(passingResult(scenario.aircraft), scenario)).toEqual([]);
    }
  });

  it("rejects structural and instrumentation regressions", () => {
    const scenario = RADAR_PERFORMANCE_SCENARIOS.at(-1);
    const result = passingResult(scenario.aircraft);
    result.dom.aircraftMarkers += 1;
    result.dom.markerHandles -= 1;
    result.dom.mountedTrafficRows = 100;
    result.trafficList.renderedRows = 99;
    result.animation.frames = 0;
    result.animation.markerWrites = 0;
    result.animation.maxActiveJobs = scenario.aircraft + 1;
    result.labelCollision.runs = 0;

    const violations = evaluateRadarPerformanceBaseline(result, scenario);
    expect(violations.some((message) => message.includes("DOM aircraft markers"))).toBe(true);
    expect(violations.some((message) => message.includes("marker handles"))).toBe(true);
    expect(violations.some((message) => message.includes("mounted row mismatch"))).toBe(true);
    expect(violations.some((message) => message.includes("mounted traffic rows"))).toBe(true);
    expect(violations.some((message) => message.includes("animation diagnostics"))).toBe(true);
    expect(violations.some((message) => message.includes("marker writes"))).toBe(true);
    expect(violations.some((message) => message.includes("active animation jobs"))).toBe(true);
    expect(violations.some((message) => message.includes("label collision diagnostics"))).toBe(true);
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
