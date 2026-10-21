#!/usr/bin/env node
/**
 * T58 report and preflight helpers. No provider traffic, secrets or
 * aircraft identifiers are written; inputs are T57 allowlisted aggregates.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const T57_BASELINE = Object.freeze({
  commit: "ca25f52b", version: "1.0.454", validSamples: 61,
  cpuP50: 41.782, cpuP95: 59.258, eventLoopP99P95: 396.624,
  eventLoopMax: 5662.310, eventOutcomeCpuMs: 439837.391,
  eventOutcomeCalls: 842, rssP50: 939.445, aircraftP50: 78,
  pendingP50: 15, atcHitRate: 0.365,
});
const FORBIDDEN_KEYS = new Set([
  "pid", "storeId", "diagnosticsStoreId", "icaoHex", "callsign",
  "registration", "latitude", "longitude", "lat", "lon", "coordinates",
  "receiverCoordinates", "cookie", "cookies", "token", "password",
  "authorization", "headers", "rawResponse", "rawApiResponse",
  "sessionId", "bearer", "apiKey", "accessToken",
]);
function checkKeys(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const item of value) checkKeys(item); return; }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw Error("t58_archive_sensitive_key");
    checkKeys(child);
  }
}
export function verifyT58Preflight(value) {
  if (value?.status !== "TELEMETRY_READY" ||
      typeof value.commit !== "string" || !/^[0-9a-f]{8,40}$/i.test(value.commit)) {
    throw Error("t58_preflight_identity_unavailable");
  }
  if (value.telemetryMode === "public") {
    if (!Array.isArray(value.requiredSources) ||
        !value.requiredSources.includes("public-system-status") ||
        !value.requiredSources.includes("public-runtime-performance") ||
        value.operationalTwinForensicsEnabled === true) {
      throw Error("t58_public_preflight_invalid");
    }
    return value.commit.toLowerCase();
  }
  if (value.operationalTwinForensicsEnabled !== true) {
    throw Error("t58_operational_twin_forensics_disabled");
  }
  return value.commit.toLowerCase();
}
export function verifyT58Summary(value) {
  if (!value || typeof value !== "object" ||
      !["PASS_WITH_LIMITATIONS", "INSUFFICIENT_EVIDENCE", "FAIL"].includes(value.verdict) ||
      typeof value.commit !== "string" || !/^[0-9a-f]{8,40}$/i.test(value.commit) ||
      typeof value.version !== "string" ||
      (value.telemetryMode !== undefined && !["admin", "public"].includes(value.telemetryMode)) ||
      !Number.isInteger(value.samples) || value.samples < 0 ||
      !Number.isInteger(value.missing) || value.missing < 0 ||
      !Number.isFinite(value.durationSeconds) || value.durationSeconds < 0) {
    throw Error("t58_invalid_summary");
  }
  checkKeys(value);
  return value;
}
const finite = v => typeof v === "number" && Number.isFinite(v) ? v : null;
const get = (obj, ...fields) => fields.reduce((x, key) => x?.[key], obj);
const fmt = (n, digits = 1) => finite(n) === null ? "N/A" : n.toFixed(digits);
const delta = (a, b) => finite(a) === null || finite(b) === null || a <= 0
  ? "N/A" : ((b - a) / a >= 0 ? "+" : "") + (100 * (b - a) / a).toFixed(1) + " %";

export function buildT58Comparison(source, { runUrl = null } = {}) {
  const report = verifyT58Summary(source), twin = report.operationalTwinForensics ?? {};
  if (runUrl !== null && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(runUrl)) {
    throw Error("t58_invalid_workflow_url");
  }
  const path = report.hotPathsByWindowCpuMs?.find(p => p.name === "twin.eventOutcome.local");
  const eventPerCall = finite(path?.cpuMs) !== null && finite(path?.calls) > 0
    ? path.cpuMs / path.calls : null;
  const entries = [
    ["Process CPU P50 (%)", T57_BASELINE.cpuP50, get(report, "cpuPercent", "p50")],
    ["Process CPU P95 (%)", T57_BASELINE.cpuP95, get(report, "cpuPercent", "p95")],
    ["Event-loop p99, P95 of windows (ms)", T57_BASELINE.eventLoopP99P95, get(report, "eventLoopWindowP99Ms", "p95")],
    ["Worst event-loop delay (ms)", T57_BASELINE.eventLoopMax, get(report, "eventLoopWindowMaxMs", "max")],
    ["Event Outcome CPU per call (ms)", T57_BASELINE.eventOutcomeCpuMs / T57_BASELINE.eventOutcomeCalls, eventPerCall],
    ["RSS P50 (MiB)", T57_BASELINE.rssP50, get(report, "memoryMiB", "rss", "p50")],
    ["ATC truth-cache hits (%)", T57_BASELINE.atcHitRate * 100,
      finite(twin.cacheHitRate) === null ? null : twin.cacheHitRate * 100],
    ["Observed aircraft P50", T57_BASELINE.aircraftP50, get(report, "load", "aircraft", "p50")],
    ["Pending predictions P50", T57_BASELINE.pendingP50, get(twin, "pendingPopulation", "p50")],
  ];
  const rows = entries.map(([label, a, b]) => "| " + label + " | " + fmt(a) +
    " | " + fmt(b) + " | " + delta(a, b) + " |");
  const warnings = [];
  if (report.telemetryMode === "public") warnings.push("PUBLIC ONLY: private Twin/SQL/GC/retention attribution and exact process identity were NOT MEASURED.");
  else if (twin.enabled !== true) warnings.push("Operational Twin forensics were not collected.");
  if (report.stableProcessAndCommit !== true) warnings.push("Process or commit changed during measurement.");
  if (report.verdict !== "PASS_WITH_LIMITATIONS") warnings.push("Collector evidence requirements were not met.");
  if (finite(get(report, "load", "aircraft", "p50")) === null ||
      finite(get(twin, "pendingPopulation", "p50")) === null) {
    warnings.push("Traffic mix comparability cannot be established.");
  }
  return [
    "# T58 — production soak vs T57", "",
    "- Baseline: " + T57_BASELINE.version + " / " + T57_BASELINE.commit +
      " (" + T57_BASELINE.validSamples + " valid samples).",
    "- Measured: " + report.version + " / " + report.commit +
      " (" + report.samples + " valid / " + report.missing + " unavailable, " +
      fmt(report.durationSeconds, 0) + " s).",
    "- Collection verdict: **" + report.verdict + "**.",
    "- Measurement mode: **" + (report.telemetryMode ?? "admin") + "**.",
    ...(runUrl ? ["- Action run: " + runUrl] : []),
    "", "| Metric | T57 | T58 | Change |", "| --- | ---: | ---: | ---: |",
    ...rows, "", "## Interpretation",
    "", "Observational before/after, NOT a controlled same-workload benchmark.",
    "Differences in traffic, pending outcomes, capture frequency, GC and clients",
    "may dominate apparent speedups. Nested CPU attribution is approximate;",
    "missing values are N/A rather than zero. The disappearance of historical",
    "5.66 s stalls cannot be proven by a single clean one-hour sample.",
    ...(warnings.length ? ["", "## Evidence warnings", "", ...warnings.map(w => "- " + w)] : []),
    "",
  ].join("\n");
}
export function main(args = process.argv.slice(2)) {
  if (args[0] === "preflight" && args.length === 2) {
    process.stdout.write(verifyT58Preflight(JSON.parse(readFileSync(args[1], "utf8"))) + "\n");
  } else if (args[0] === "verify" && args.length === 2) {
    verifyT58Summary(JSON.parse(readFileSync(args[1], "utf8")));
    process.stdout.write("T58 allowlisted report verified\n");
  } else if (args[0] === "comparison" && (args.length === 3 || args.length === 4)) {
    writeFileSync(args[2], buildT58Comparison(JSON.parse(readFileSync(args[1], "utf8")),
      { runUrl: args[3] ?? null }), { flag: "wx", mode: 0o600 });
  } else throw Error("t58_invalid_arguments");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    process.stderr.write(/^t58_[a-z_]+$/.test(error?.message ?? "")
      ? error.message + "\n" : "t58_report_unavailable\n");
    process.exitCode = 1;
  }
}
