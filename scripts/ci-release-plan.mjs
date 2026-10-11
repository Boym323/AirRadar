#!/usr/bin/env node
/**
 * Conservative release gates based on the entire pushed diff.
 * Unknown/shared paths always receive full coverage.
 */
import { fileURLToPath } from "node:url";

export const FAST_VISUAL_TARGETS = [
  "radar-desktop",
  "radar-mobile",
  "system-desktop",
  "airport-live-board-desktop",
  "airport-live-board-mobile",
  "aircraft-detail-mobile",
];
const RADAR_TARGETS = [
  "radar-desktop-selected", "radar-mobile-selected", "radar-v6-multiview-desktop",
  "radar-v6-multiview-mobile", "radar-v6-d-3d-terrain", "radar-v6-d-3d-mobile",
];
const AIRPORT_TARGETS = [
  "airport-v5-map-desktop", "airport-v5-map-mobile",
  "airport-v5-analytics-desktop", "airport-v5-analytics-mobile",
];
const AIRCRAFT_TARGETS = [
  "aircraft-detail-desktop", "aircraft-detail-telemetry-expanded",
  "aircraft-detail-receiver",
];
const FAST_VIEWPORTS = "375x812,821x1000";
const FAST_PERFORMANCE_SCENARIOS = "100,1000,3000";

const backendOnly = [
  /^app\/api\//, /^lib\/server\//, /^migrations\//, /^prisma\//,
  /^tests\//,
];
const radarOnly = [/^components\/radar\//, /^lib\/radar\//];
const airportOnly = [/^components\/airport[^/]*\//, /^components\/airport[^/]*\.[jt]sx?$/, /^app\/airports\//];
const aircraftOnly = [/^app\/aircraft\//, /^components\/aircraft[^/]*\//, /^components\/aircraft[^/]*\.[jt]sx?$/];
const nonRuntime = [
  /^docs\/.*\.md$/, /^README\.md$/, /^CHANGELOG\.md$/,
  /^docs\/metrics\/(?:code-history\.json|code-growth\.svg)$/,
];

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

export function planReleaseGates(paths) {
  // Empty/invalid input must never silently downgrade coverage.
  if (!Array.isArray(paths) || paths.length === 0) return full("missing change scope");
  const kinds = new Set();
  let fullPerformance = false;
  for (const path of paths) {
    if (typeof path !== "string" || !path || path.includes("\0") || path.includes("\\")) {
      return full("invalid changed path");
    }
    if (matchesAny(path, nonRuntime)) continue;
    if (matchesAny(path, radarOnly)) {
      kinds.add("radar");
      fullPerformance = true;
    } else if (matchesAny(path, airportOnly)) {
      kinds.add("airport");
    } else if (matchesAny(path, aircraftOnly)) {
      kinds.add("aircraft");
    } else if (matchesAny(path, backendOnly)) {
      kinds.add("backend");
      if (/^lib\/server\/(?:aircraft-state|sse-capacity|runtime-diagnostics|source-reliability)/.test(path)) {
        fullPerformance = true;
      }
    } else {
      return full(`shared or unclassified path: ${path}`);
    }
  }
  if (kinds.size === 0) return full("no runtime changes");
  const visualKinds = [...kinds].filter((kind) => kind !== "backend");
  if (visualKinds.length > 1) return full("cross-feature visual changes");
  const targets = [...FAST_VISUAL_TARGETS];
  if (kinds.has("radar")) targets.push(...RADAR_TARGETS);
  if (kinds.has("airport")) targets.push(...AIRPORT_TARGETS);
  if (kinds.has("aircraft")) targets.push(...AIRCRAFT_TARGETS);
  const browser = visualKinds.length ? "targeted" : "fast";
  return {
    browser,
    visualTargets: [...new Set(targets)].join(","),
    viewports: FAST_VIEWPORTS,
    performance: fullPerformance ? "full" : "fast",
    performanceScenarios: fullPerformance ? "" : FAST_PERFORMANCE_SCENARIOS,
    reason: [...kinds].sort().join(", "),
  };
}

function full(reason) {
  return { browser: "full", visualTargets: "", viewports: "",
    performance: "full", performanceScenarios: "", reason };
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
