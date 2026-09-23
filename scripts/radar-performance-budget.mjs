export const RADAR_PERFORMANCE_SCENARIOS = Object.freeze(
  [50, 100, 250, 500].map((aircraft) => ({
    aircraft,
    budget: {
      // CI gates only deterministic structural invariants. Wall-clock timings
      // are recorded in the baseline report, but hosted-runner load must not
      // turn them into flaky pass/fail criteria.
      maxMountedTrafficRows: 36,
    },
  })),
);

export function evaluateRadarPerformanceBaseline(result, scenario) {
  const violations = [];
  const { aircraft, budget } = scenario;
  const fail = (message) => violations.push(message);

  if (result.aircraft !== aircraft) fail(`scenario aircraft mismatch: expected ${aircraft}, got ${result.aircraft}`);
  if (result.dom.aircraftMarkers !== aircraft) fail(`DOM aircraft markers: expected ${aircraft}, got ${result.dom.aircraftMarkers}`);
  if (result.dom.markerHandles !== aircraft) fail(`marker handles: expected ${aircraft}, got ${result.dom.markerHandles}`);
  if (result.trafficList.totalRows !== aircraft) fail(`traffic rows: expected ${aircraft}, got ${result.trafficList.totalRows}`);
  if (!result.trafficList.virtualized) fail("traffic list must be virtualized for baseline scenarios");
  if (result.trafficList.renderedRows !== result.dom.mountedTrafficRows) {
    fail(`mounted row mismatch: diagnostics=${result.trafficList.renderedRows}, DOM=${result.dom.mountedTrafficRows}`);
  }
  if (result.dom.mountedTrafficRows > budget.maxMountedTrafficRows) {
    fail(`mounted traffic rows ${result.dom.mountedTrafficRows} > budget ${budget.maxMountedTrafficRows}`);
  }

  // These are health/instrumentation invariants rather than timing budgets.
  // They prove the measured production path was actually active.
  if (result.animation.frames < 1) fail("animation diagnostics did not record a frame");
  if (result.animation.markerWrites < aircraft) {
    fail(`marker writes ${result.animation.markerWrites} < one full aircraft sweep ${aircraft}`);
  }
  if (result.animation.maxActiveJobs > aircraft) {
    fail(`active animation jobs ${result.animation.maxActiveJobs} > aircraft ${aircraft}`);
  }
  if (result.labelCollision.runs < 1) fail("label collision diagnostics did not record a run");

  return violations;
}
