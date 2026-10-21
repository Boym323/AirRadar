#!/usr/bin/env node
/**
 * Conservative release gates computed from every file in the pushed diff.
 * One known visual workstream may use a targeted smoke; shared code, multiple
 * visual workstreams, and unclassified paths always require FULL coverage.
 */
import { fileURLToPath } from "node:url";

export const FAST_VISUAL_TARGETS = [
  "radar-desktop", "radar-mobile", "system-desktop",
  "airport-v5-map-desktop", "airport-v5-map-mobile",
  "aircraft-detail-mobile",
];

const RADAR_TARGETS = [
  "radar-desktop-selected", "radar-tablet-landscape-selected",
  "radar-tablet-portrait-selected", "radar-mobile-selected",
  "radar-mobile-selected-expanded", "radar-mobile-320", "radar-mobile-320-credits",
  "radar-v6-multiview-desktop", "radar-v6-multiview-mobile",
  "radar-v6-light-basemap", "radar-v6-satellite-basemap",
  "radar-v5-map-focus-desktop", "radar-v5-map-focus-mobile",
];
const AIRPORT_TARGETS = [
  "airport-v5-map-desktop", "airport-v5-map-mobile",
];
const AIRCRAFT_TARGETS = [
  "aircraft-detail-desktop", "aircraft-detail-tablet", "aircraft-detail-mobile",
  "aircraft-detail-telemetry-expanded", "aircraft-detail-receiver",
];
const FEATURE_TARGETS = {
  radar: RADAR_TARGETS,
  airport: AIRPORT_TARGETS,
  aircraft: AIRCRAFT_TARGETS,
  system: ["system-desktop"],
  weather: ["weather-data-desktop", "weather-empty-mobile"],
  receiver: ["receiver-unavailable-desktop", "receiver-unavailable-mobile"],
};
const FULL_PERFORMANCE_RUNTIME = /^lib\/server\/(?:aircraft-state|sse-capacity|runtime-diagnostics|source-reliability)/;
const FAST_VIEWPORTS = "375x812,821x1000";
const FAST_PERFORMANCE_SCENARIOS = "100,1000,3000";
const DOCUMENTATION = [
  /^docs\/.*\.md$/, /^README\.md$/, /^CHANGELOG\.md$/,
  /^artifacts\/performance\/OPTIMIZATION-PROGRESS\.md$/,
  /^artifacts\/performance\/route-telemetry-benchmark\.json$/,
];
const RULES = [
  // Pure ATC geometry/context and outcome evaluation affect the radar but
  // do not change shared UI layouts. Still run radar-specific browser captures
  // and the FULL performance baseline. Unknown/shared paths remain fail-closed.
  { kind: "radar", paths: [
    /^components\/radar\//, /^lib\/radar\//,
    /^lib\/atc-context\/(?:engine|geometry|handoff|prediction)\.ts$/,
    /^lib\/operational-twin\/(?:event-outcome|outcome|regional-focus-queue|regional-situation)\.ts$/,
  ] },
  { kind: "airport", paths: [
    /^app\/airports\//, /^components\/(?:airport[^/]*|airports-[^/]*|live-airport-network[^/]*)\.(?:[cm]?[jt]sx?|css)$/,
    /^components\/airport[^/]*\//,
  ] },
  { kind: "aircraft", paths: [
    /^app\/aircraft\//,
    /^components\/(?:aircraft-(?:detail|observed-weather|communications|weather-fusion|weather-panel|adsb-telemetry|operational-twin)[^/]*|predictive-aircraft-advisories[^/]*)\.(?:[cm]?[jt]sx?|css)$/,
  ] },
  { kind: "system", paths: [/^app\/system\//, /^components\/system-[^/]+\.(?:[cm]?[jt]sx?|css)$/] },
  { kind: "weather", paths: [/^app\/weather\//, /^components\/weather-operations-center[^/]*\.(?:[cm]?[jt]sx?|css)$/] },
  { kind: "receiver", paths: [/^app\/receiver\//, /^components\/receiver-[^/]+\.(?:[cm]?[jt]sx?|css)$/] },
];
const BACKEND_ONLY = [/^app\/api\//, /^lib\/server\//, /^migrations\//, /^prisma\//, /^tests\//];

function matches(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}
function full(reason) {
  return { browser: "full", visualTargets: "", viewports: "",
    performance: "full", performanceScenarios: "", reason };
}
export function planReleaseGates(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return full("missing change scope");
  const kinds = new Set();
  let fullPerformance = false;
  for (const path of paths) {
    if (typeof path !== "string" || !path || path.includes("\0") || path.includes("\\") || path.includes("../")) {
      return full("invalid changed path");
    }
    if (matches(path, DOCUMENTATION)) continue;
    const matchingRules = RULES.filter(({ paths: patterns }) => matches(path, patterns));
    if (matchingRules.length === 1) {
      kinds.add(matchingRules[0].kind);
      if (matchingRules[0].kind === "radar") fullPerformance = true;
    } else if (matchingRules.length > 1) {
      return full(`ambiguous feature path: ${path}`);
    } else if (matches(path, BACKEND_ONLY)) {
      kinds.add("backend");
      if (FULL_PERFORMANCE_RUNTIME.test(path)) fullPerformance = true;
    } else {
      return full(`shared or unclassified path: ${path}`);
    }
  }
  const visualKinds = [...kinds].filter((kind) => kind !== "backend");
  if (visualKinds.length === 0) return kinds.size ? {
    browser: "fast", visualTargets: FAST_VISUAL_TARGETS.join(","), viewports: FAST_VIEWPORTS,
    performance: fullPerformance ? "full" : "fast",
    performanceScenarios: fullPerformance ? "" : FAST_PERFORMANCE_SCENARIOS,
    reason: [...kinds].sort().join(", "),
  } : full("no runtime changes");
  if (visualKinds.length > 1) return full("cross-feature visual changes");
  const kind = visualKinds[0];
  return {
    browser: "targeted",
    visualTargets: [...new Set([...FAST_VISUAL_TARGETS, ...FEATURE_TARGETS[kind]])].join(","),
    viewports: FAST_VIEWPORTS,
    performance: fullPerformance ? "full" : "fast",
    performanceScenarios: fullPerformance ? "" : FAST_PERFORMANCE_SCENARIOS,
    reason: [...kinds].sort().join(", "),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.argv.includes("--stdin0")) {
    console.error("Usage: node scripts/ci-release-plan.mjs --stdin0");
    process.exitCode = 2;
  } else {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const paths = Buffer.concat(chunks).toString("utf8").split("\0").filter(Boolean);
    process.stdout.write(JSON.stringify(planReleaseGates(paths)) + "\n");
  }
}
