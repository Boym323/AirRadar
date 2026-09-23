export const RADAR_PERFORMANCE_SCENARIOS = Object.freeze([
  {
    aircraft: 50,
    budget: {
      maxAnimationAverageMs: 20,
      maxAnimationFrameMs: 100,
      maxLabelCollisionAverageMs: 30,
      maxLabelCollisionRunMs: 150,
      maxLongTasks: 4,
      maxLongTaskMs: 250,
      maxMountedTrafficRows: 36,
      minMarkerWritesPerSecond: 100,
    },
  },
  {
    aircraft: 100,
    budget: {
      maxAnimationAverageMs: 25,
      maxAnimationFrameMs: 120,
      maxLabelCollisionAverageMs: 40,
      maxLabelCollisionRunMs: 180,
      maxLongTasks: 6,
      maxLongTaskMs: 250,
      maxMountedTrafficRows: 36,
      minMarkerWritesPerSecond: 180,
    },
  },
  {
    aircraft: 250,
    budget: {
      maxAnimationAverageMs: 40,
      maxAnimationFrameMs: 160,
      maxLabelCollisionAverageMs: 75,
      maxLabelCollisionRunMs: 250,
      maxLongTasks: 10,
      maxLongTaskMs: 300,
      maxMountedTrafficRows: 36,
      minMarkerWritesPerSecond: 400,
    },
  },
  {
    aircraft: 500,
    budget: {
      maxAnimationAverageMs: 60,
      maxAnimationFrameMs: 220,
      maxLabelCollisionAverageMs: 120,
      maxLabelCollisionRunMs: 350,
      maxLongTasks: 16,
      maxLongTaskMs: 400,
      maxMountedTrafficRows: 36,
      minMarkerWritesPerSecond: 700,
    },
  },
]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

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

  if (result.animation.frames < 3) fail(`animation frames ${result.animation.frames} < 3`);
  if (!finite(result.animation.markerWritesPerSecond) || result.animation.markerWritesPerSecond < budget.minMarkerWritesPerSecond) {
    fail(`marker writes/s ${result.animation.markerWritesPerSecond} < budget ${budget.minMarkerWritesPerSecond}`);
  }
  if (!finite(result.animation.averageMs) || result.animation.averageMs > budget.maxAnimationAverageMs) {
    fail(`animation average ${result.animation.averageMs}ms > budget ${budget.maxAnimationAverageMs}ms`);
  }
  if (!finite(result.animation.maxMs) || result.animation.maxMs > budget.maxAnimationFrameMs) {
    fail(`animation max ${result.animation.maxMs}ms > budget ${budget.maxAnimationFrameMs}ms`);
  }

  if (result.labelCollision.runs < 1) fail("label collision did not run");
  if (!finite(result.labelCollision.averageMs) || result.labelCollision.averageMs > budget.maxLabelCollisionAverageMs) {
    fail(`label collision average ${result.labelCollision.averageMs}ms > budget ${budget.maxLabelCollisionAverageMs}ms`);
  }
  if (!finite(result.labelCollision.maxMs) || result.labelCollision.maxMs > budget.maxLabelCollisionRunMs) {
    fail(`label collision max ${result.labelCollision.maxMs}ms > budget ${budget.maxLabelCollisionRunMs}ms`);
  }

  if (result.longTasks.count > budget.maxLongTasks) {
    fail(`long tasks ${result.longTasks.count} > budget ${budget.maxLongTasks}`);
  }
  if (result.longTasks.count > 0 && result.longTasks.maxMs > budget.maxLongTaskMs) {
    fail(`long task max ${result.longTasks.maxMs}ms > budget ${budget.maxLongTaskMs}ms`);
  }

  return violations;
}
