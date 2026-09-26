export const RADAR_PERFORMANCE_SCENARIOS = Object.freeze(
  [50, 100, 250, 500, 1000, 1600, 2000, 3000, 5000].map((aircraft) => ({
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
  if (result.webgl.aircraft !== aircraft) fail(`WebGL aircraft: expected ${aircraft}, got ${result.webgl.aircraft}`);
  if (result.dom.aircraftMarkers !== 0) fail(`DOM aircraft markers: expected 0 bulk markers, got ${result.dom.aircraftMarkers}`);
  if (result.dom.markerHandles !== 0) fail(`HTML marker handles: expected 0 bulk handles, got ${result.dom.markerHandles}`);
  if (result.trafficList.totalRows !== aircraft) fail(`traffic rows: expected ${aircraft}, got ${result.trafficList.totalRows}`);
  if (!result.trafficList.virtualized) fail("traffic list must be virtualized for baseline scenarios");
  if (result.trafficList.renderedRows !== result.dom.mountedTrafficRows) {
    fail(`mounted row mismatch: diagnostics=${result.trafficList.renderedRows}, DOM=${result.dom.mountedTrafficRows}`);
  }
  if (result.dom.mountedTrafficRows > budget.maxMountedTrafficRows) {
    fail(`mounted traffic rows ${result.dom.mountedTrafficRows} > budget ${budget.maxMountedTrafficRows}`);
  }

  // These are health/instrumentation invariants rather than timing budgets.
  // They prove the measured production path was actually active. Validate the
  // counters before applying thresholds so missing/renamed/NaN fields cannot
  // accidentally pass comparisons such as undefined < 1.
  const finiteCounter = (label, value) => {
    if (!Number.isFinite(value)) {
      fail(`${label} must be a finite number, got ${String(value)}`);
      return false;
    }
    return true;
  };

  const framesValid = finiteCounter("animation frames", result.animation.frames);
  const markerWritesValid = finiteCounter("marker writes", result.animation.markerWrites);
  const activeJobsValid = finiteCounter("active animation jobs", result.animation.maxActiveJobs);
  const collisionRunsValid = finiteCounter("label collision runs", result.labelCollision.runs);

  if (framesValid && result.animation.frames < 1) fail("animation diagnostics did not record a frame");
  if (markerWritesValid && result.animation.markerWrites < aircraft) {
    fail(`marker writes ${result.animation.markerWrites} < one full aircraft sweep ${aircraft}`);
  }
  if (activeJobsValid && result.animation.maxActiveJobs > aircraft) {
    fail(`active animation jobs ${result.animation.maxActiveJobs} > aircraft ${aircraft}`);
  }
  // Bulk labels are owned by MapLibre's symbol collision engine. The legacy
  // HTML collision scheduler may legitimately stay idle when no special
  // selected/watchlist/emergency marker is present.

  return violations;
}
