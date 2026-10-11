import test from "node:test";
import assert from "node:assert/strict";
import { planReleaseGates, FAST_VISUAL_TARGETS } from "../scripts/ci-release-plan.mjs";

test("unknown and missing scopes fail closed", () => {
  assert.equal(planReleaseGates([]).browser, "full");
  assert.equal(planReleaseGates(["lib/i18n/cs.ts"]).browser, "full");
  assert.equal(planReleaseGates(["components/ui-primitives.tsx"]).browser, "full");
  assert.equal(planReleaseGates([".github/workflows/ci.yml"]).browser, "full");
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
