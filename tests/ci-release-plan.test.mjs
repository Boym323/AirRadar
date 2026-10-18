import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { planReleaseGates, FAST_VISUAL_TARGETS } from "../scripts/ci-release-plan.mjs";

test("unknown and missing scopes fail closed", () => {
  assert.equal(planReleaseGates([]).browser, "full");
  assert.equal(planReleaseGates(["lib/i18n/cs.ts"]).browser, "full");
  assert.equal(planReleaseGates(["components/ui-primitives.tsx"]).browser, "full");
  assert.equal(planReleaseGates([".github/workflows/ci.yml"]).browser, "full");
  assert.equal(planReleaseGates(["scripts/sync-maplibre-worker.mjs"]).browser, "full");
  assert.equal(planReleaseGates(["app/api/health/route.ts", "../unknown"]).browser, "full");
  assert.equal(planReleaseGates(["app\\api\\health"]).browser, "full");
});
test("backend changes use fast browser smoke but retain core gates", () => {
  const plan = planReleaseGates(["app/api/aircraft/route.ts", "lib/server/flight-routes.ts"]);
  assert.equal(plan.browser, "fast");
  assert.equal(plan.performance, "fast");
  assert.equal(plan.viewports, "375x812,821x1000");
  assert.deepEqual(plan.visualTargets.split(","), FAST_VISUAL_TARGETS);
});
test("radar rendering changes require complete performance baseline", () => {
  const plan = planReleaseGates(["components/radar/radar-3d.tsx"]);
  assert.equal(plan.browser, "targeted");
  assert.equal(plan.performance, "full");
  assert.match(plan.visualTargets, /radar-v6-d-3d-mobile/);
});
test("airport-only changes have expanded airport coverage", () => {
  const plan = planReleaseGates(["app/airports/[icao]/page.tsx"]);
  assert.equal(plan.browser, "targeted");
  assert.match(plan.visualTargets, /airport-v5-map-mobile/);
  assert.equal(plan.performance, "fast");
});
test("cross-feature changes require full browser validation", () => {
  assert.equal(planReleaseGates(["components/radar/map.tsx", "app/airports/page.tsx"]).browser, "full");
  assert.equal(planReleaseGates(["lib/server/flight-routes.ts", "components/ui-primitives.tsx"]).browser, "full");
});
test("critical runtime changes require full performance baseline", () => {
  assert.equal(planReleaseGates(["lib/server/sse-capacity.ts"]).performance, "full");
});
test("documentation and tests never create an empty fast plan", () => {
  assert.equal(planReleaseGates(["README.md"]).browser, "full");
  assert.equal(planReleaseGates(["tests/sse-capacity.test.ts"]).browser, "fast");
});

test("each targeted screenshot name exists in the real production capture list", () => {
  const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
  const start = source.indexOf("const visualTargets = [");
  const end = source.indexOf("      ];", start);
  assert.ok(start > 0 && end > start, "visual target registry missing");
  const declared = new Set([...source.slice(start, end).matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]));
  const examples = [
    "components/radar/radar-3d.tsx", "components/airport-map.tsx", "app/aircraft/896139/page.tsx",
    "app/statistics/page.tsx", "components/weather-operations-center.tsx",
    "components/system-status-page.tsx", "components/receiver-explorer.module.css",
    "components/watchlist-page.tsx", "components/notification-center.tsx",
    "components/recap-page.tsx", "components/operations-dashboard.tsx",
  ];
  for (const path of examples) {
    const planned = planReleaseGates([path]);
    assert.equal(planned.browser, "targeted", path);
    for (const name of planned.visualTargets.split(",")) assert.ok(declared.has(name), `${path}: missing screenshot ${name}`);
  }
});
test("ambiguous or cross-feature visual components retain full coverage", () => {
  const shared = ["components/airradar-shell.tsx", "components/aircraft-traffic-list.tsx",
    "lib/server/flight-routes.ts", "scripts/ci-browser-concurrency.mjs"];
  for (const path of shared) {
    if (path.startsWith("lib/server/")) {
      assert.equal(planReleaseGates([path]).browser, "fast");
    } else {
      assert.equal(planReleaseGates([path]).browser, "full", path);
    }
  }
  assert.equal(planReleaseGates(["app/weather/page.tsx", "app/watchlist/page.tsx"]).browser, "full");
});
test("critical server streaming changes retain full benchmark", () => {
  assert.equal(planReleaseGates(["lib/server/runtime-diagnostics.ts"]).performance, "full");
});

test("isolated ATC context and Operational Twin evaluation use radar-targeted UI checks", () => {
  for (const file of [
    "lib/atc-context/engine.ts",
    "lib/atc-context/geometry.ts",
    "lib/atc-context/handoff.ts",
    "lib/atc-context/prediction.ts",
    "lib/operational-twin/event-outcome.ts",
    "lib/operational-twin/outcome.ts",
  ]) {
    const plan = planReleaseGates([file]);
    assert.equal(plan.browser, "targeted", file);
    assert.equal(plan.performance, "full", file);
    assert.match(plan.visualTargets, /radar-desktop-selected/, file);
    assert.match(plan.visualTargets, /radar-v6-d-3d-mobile/, file);
  }
  assert.equal(planReleaseGates(["lib/operational-twin/map.ts"]).browser, "full");
  assert.equal(planReleaseGates(["lib/atc-context/types.ts"]).browser, "full");
  assert.equal(planReleaseGates(["lib/atc-context/engine.ts", "components/airport-map.tsx"]).browser, "full");
  assert.equal(planReleaseGates([".github/workflows/ci.yml"]).browser, "full");
});

// Strictly allowlisted non-runtime evidence must not expand backend gates.
test("performance audit artifacts do not force full browser regression", () => {
  const plan = planReleaseGates([
    "lib/server/route-enrichment-telemetry.ts",
    "artifacts/performance/OPTIMIZATION-PROGRESS.md",
    "artifacts/performance/route-telemetry-benchmark.json",
  ]);
  assert.equal(plan.browser, "fast");
  assert.equal(plan.performance, "fast");
  assert.equal(planReleaseGates(["artifacts/performance/unreviewed-benchmark.json"]).browser, "full");
  assert.equal(planReleaseGates(["lib/server/enrichment-cache.ts", "package.json"]).browser, "full");
});
