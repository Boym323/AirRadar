#!/usr/bin/env node
/**
 * T5.6D: compare two already captured T5.6 memory reports.
 * Offline, read-only and identifier-free output. Never logs report rows,
 * diagnosticsStoreId, PID, credentials or per-aircraft information.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { analyzeT56Samples } from "./t56-memory-analysis.mjs";
import { stats } from "./t55-runtime-analysis.mjs";

const MiB = 1024 * 1024;
const MAX_ROWS = 600;
const round = (value) => Number(value.toFixed(3));
const median = (samples, field) => stats(samples.map((row) => row[field]))?.p50 ?? null;

function prepare(report) {
  if (!report || report.schemaVersion !== 1 || !Array.isArray(report.rows) ||
      report.rows.length < 2 || report.rows.length > MAX_ROWS ||
      !Array.isArray(report.unavailable) || report.unavailable.length > MAX_ROWS ||
      !Number.isInteger(report.warmupSeconds) || report.warmupSeconds < 0 ||
      report.warmupSeconds > 1800) {
    throw new Error("invalid_t56_report");
  }
  let previous = Number.NEGATIVE_INFINITY;
  for (const row of report.rows) {
    const at = Date.parse(row?.at ?? "");
    if (!Number.isFinite(at) || at <= previous) throw new Error("invalid_t56_sample_order");
    previous = at;
  }
  // Recalculate rather than trusting summaries embedded in the input JSON.
  const summary = analyzeT56Samples(report.rows, report.unavailable, report.warmupSeconds);
  const warmupEnd = Date.parse(report.rows[0].at) + report.warmupSeconds * 1000;
  const steady = report.rows.filter((row) => Date.parse(row.at) >= warmupEnd);
  const load = {
    aircraft: median(steady, "aircraftCount"),
    localTrails: median(steady, "localTrailPoints"),
    networkTrails: median(steady, "networkTrailPoints"),
    sseClients: median(steady, "sseClients"),
    sseClientMax: stats(steady.map((row) => row.sseClients))?.max ?? null,
  };
  const breaches = steady.some((row) =>
    !Number.isInteger(row.localTrailOverLimitAircraft) ||
    !Number.isInteger(row.networkTrailOverLimitAircraft) ||
    row.localTrailOverLimitAircraft !== 0 || row.networkTrailOverLimitAircraft !== 0);
  return { summary, load, breaches };
}

function matchedNumber(name, before, after, tolerance = 0.15) {
  if (before === null || after === null) return name + "_missing";
  if (before === 0 || after === 0) return before === after ? null : name + "_zero_mismatch";
  return Math.abs(after - before) / Math.max(before, after) <= tolerance
    ? null : name + "_load_mismatch";
}

function memoryDelta(before, after, metric, percentile = "p50") {
  const a = before.summary.memoryMiB[metric]?.[percentile];
  const b = after.summary.memoryMiB[metric]?.[percentile];
  return typeof a === "number" && typeof b === "number" ? round(b - a) : null;
}

export function compareT56MemoryReports(beforeReport, afterReport) {
  const before = prepare(beforeReport);
  const after = prepare(afterReport);
  const reasons = [];
  if (before.summary.verdict !== "PASS_WITH_LIMITATIONS") reasons.push("before_insufficient_evidence");
  if (after.summary.verdict !== "PASS_WITH_LIMITATIONS") reasons.push("after_insufficient_evidence");
  if (before.breaches || after.breaches) reasons.push("trail_bound_violation_or_missing");
  if (!before.summary.commit || !after.summary.commit || before.summary.commit === after.summary.commit) {
    reasons.push("distinct_commits_required");
  }
  if (before.summary.warmupSeconds !== after.summary.warmupSeconds) reasons.push("different_warmup");
  const beforeWindow = before.summary.elapsedSeconds, afterWindow = after.summary.elapsedSeconds;
  if (typeof beforeWindow !== "number" || typeof afterWindow !== "number" ||
      Math.abs(afterWindow - beforeWindow) / Math.max(afterWindow, beforeWindow) > 0.2) {
    reasons.push("different_window_duration");
  }
  for (const key of ["aircraft", "localTrails", "networkTrails", "sseClients"]) {
    const mismatch = matchedNumber(key, before.load[key], after.load[key], key === "sseClients" ? 0.0 : 0.15);
    if (mismatch) reasons.push(mismatch);
  }
  if (before.load.sseClientMax === null || after.load.sseClientMax === null ||
      before.load.sseClientMax !== after.load.sseClientMax) reasons.push("sse_peak_mismatch");

  return {
    verdict: reasons.length ? "INCOMPARABLE" : "MATCHED_OBSERVATIONAL_ONLY",
    reasons,
    before: {
      version: before.summary.version,
      samples: before.summary.samples,
      windowSeconds: before.summary.elapsedSeconds,
      load: before.load,
      majorGcBaselines: before.summary.majorGcBaselines,
    },
    after: {
      version: after.summary.version,
      samples: after.summary.samples,
      windowSeconds: after.summary.elapsedSeconds,
      load: after.load,
      majorGcBaselines: after.summary.majorGcBaselines,
    },
    observedAfterMinusBeforeMiB: {
      rssP50: memoryDelta(before, after, "rss"),
      rssP95: memoryDelta(before, after, "rss", "p95"),
      heapUsedP50: memoryDelta(before, after, "heapUsed"),
      oldSpaceP50: (() => {
        const a = before.summary.v8SpacesUsedMiB.oldSpace?.p50;
        const b = after.summary.v8SpacesUsedMiB.oldSpace?.p50;
        return typeof a === "number" && typeof b === "number" ? round(b - a) : null;
      })(),
      postMajorGcHeapTrend: (() => {
        const a = before.summary.postMajorGcTrendMiB.heapUsed;
        const b = after.summary.postMajorGcTrendMiB.heapUsed;
        return typeof a === "number" && typeof b === "number" ? round(b - a) : null;
      })(),
    },
    limitations: [
      "Matched load is approximate: medians cannot prove identical traffic or object retention.",
      "Node version, traffic composition, uptime and external memory consumers must be checked manually.",
      "Major-GC observer-time samples are not object-retainer graphs; RSS alone cannot prove a leak.",
      "An observational delta is not proof of a causal performance improvement.",
      "Zero SSE clients in both windows provides no evidence about SSE fanout performance.",
    ],
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error("usage: node scripts/t56d-matched-evidence.mjs BEFORE.json AFTER.json");
  const input = await Promise.all(args.map(async (path) => {
    const content = await readFile(path, { encoding: "utf8" });
    if (content.length > 2_500_000) throw new Error("report_too_large");
    return JSON.parse(content);
  }));
  const result = compareT56MemoryReports(input[0], input[1]);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (result.verdict !== "MATCHED_OBSERVATIONAL_ONLY") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("T5.6D comparison failed: check two private T5.6 report files.\n");
    process.exitCode = 1;
  });
}
