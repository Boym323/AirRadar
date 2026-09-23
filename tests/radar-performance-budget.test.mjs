import { describe, expect, it } from "vitest";
import { RADAR_PERFORMANCE_SCENARIOS, evaluateRadarPerformanceBaseline } from "../scripts/radar-performance-budget.mjs";

function passingResult(aircraft) {
  return {
    aircraft,
    dom: { aircraftMarkers: aircraft, markerHandles: aircraft, mountedTrafficRows: 24 },
    trafficList: { totalRows: aircraft, renderedRows: 24, virtualized: true },
    animation: { frames: 12, averageMs: 4, maxMs: 12, markerWritesPerSecond: 2000 },
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

  it("rejects DOM growth, stalled animation, and timing regressions", () => {
    const scenario = RADAR_PERFORMANCE_SCENARIOS.at(-1);
    const result = passingResult(scenario.aircraft);
    result.dom.aircraftMarkers += 1;
    result.dom.mountedTrafficRows = 100;
    result.trafficList.renderedRows = 100;
    result.animation.frames = 0;
    result.animation.averageMs = scenario.budget.maxAnimationAverageMs + 1;
    result.animation.markerWritesPerSecond = 0;
    result.labelCollision.averageMs = scenario.budget.maxLabelCollisionAverageMs + 1;
    result.longTasks.count = scenario.budget.maxLongTasks + 1;

    const violations = evaluateRadarPerformanceBaseline(result, scenario);
    expect(violations.some((message) => message.includes("DOM aircraft markers"))).toBe(true);
    expect(violations.some((message) => message.includes("mounted traffic rows"))).toBe(true);
    expect(violations.some((message) => message.includes("animation frames"))).toBe(true);
    expect(violations.some((message) => message.includes("animation average"))).toBe(true);
    expect(violations.some((message) => message.includes("marker writes/s"))).toBe(true);
    expect(violations.some((message) => message.includes("label collision average"))).toBe(true);
    expect(violations.some((message) => message.includes("long tasks"))).toBe(true);
  });
});
