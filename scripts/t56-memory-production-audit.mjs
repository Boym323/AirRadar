#!/usr/bin/env node
/**
 * T5.6: authenticated, read-only V8 heap-space / post-major-GC audit.
 *
 * On the production host:
 *   T56_SECONDS=3600 T56_INTERVAL_SECONDS=30 T56_WARMUP_SECONDS=600 \
 *     node scripts/t56-memory-production-audit.mjs
 *
 * WATCHLIST_ADMIN_TOKEN must be provided securely by the environment.
 * This collects no raw aircraft positions, aircraft IDs, SQL, tokens, heap
 * snapshots or process stack traces. No forced GC, restarts or DB writes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { login, fetchJson } from "./t53-navigation-production-sampler.mjs";
import { projectT56Sample, analyzeT56Samples } from "./t56-memory-analysis.mjs";

function setting(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

async function collect(base, cookie) {
  const [status, metrics] = await Promise.all([
    fetchJson(base, "/api/system/status", cookie),
    fetchJson(base, "/api/system/runtime-performance", cookie),
  ]);
  return projectT56Sample(status, metrics);
}

function markdown(s) {
  const fmt = (n, suffix = "") => n === null || n === undefined ? "unavailable" : String(n) + suffix;
  const mem = s.memoryMiB;
  return [
    "# AirRadar T5.6: Production memory attribution",
    "",
    "**Verdict:** " + s.verdict,
    "",
    "- Commit/version: " + fmt(s.commit) + " / " + fmt(s.version),
    "- Samples / missed: " + s.samples + " / " + s.unavailableSamples,
    "- Same process and build: " + s.stableProcessAndCommit,
    "- Window: " + fmt(s.elapsedSeconds, " s") + "; warmup excluded: " + s.warmupSeconds + " s",
    "- Steady-state samples: " + s.steadyStateSamples,
    "- Distinct approximate post-major-GC observations: " + s.majorGcBaselines,
    "",
    "## Steady-state memory (MiB)",
    "",
    "| Metric | P50 | P95 | Max |",
    "|---|---:|---:|---:|",
    ...Object.entries(mem).map(([name, values]) => "| " + name + " | " +
      fmt(values?.p50) + " | " + fmt(values?.p95) + " | " + fmt(values?.max) + " |"),
    "",
    "## V8 spaces used (MiB)",
    "",
    ...Object.entries(s.v8SpacesUsedMiB).map(([name, values]) =>
      "- " + name + " p50/p95: " + fmt(values?.p50) + " / " + fmt(values?.p95)),
    "",
    "## Approximate post-major-GC baseline delta (MiB)",
    "",
    ...Object.entries(s.postMajorGcTrendMiB).map(([name, value]) => "- " + name + ": " + fmt(value)),
    "",
    "## Retained live trail point totals (aggregate)",
    "",
    "- Local trail points p50/max: " + fmt(s.trails.localPoints?.p50) + " / " + fmt(s.trails.localPoints?.max),
    "- Network trail points p50/max: " + fmt(s.trails.networkPoints?.p50) + " / " + fmt(s.trails.networkPoints?.max),
    "- Local aircraft p50/max: " + fmt(s.trails.localAircraft?.p50) + " / " + fmt(s.trails.localAircraft?.max),
    "- Network aircraft p50/max: " + fmt(s.trails.networkAircraft?.p50) + " / " + fmt(s.trails.networkAircraft?.max),
    "- Trail bounds aggregates available: " + s.trails.boundsDiagnosticsComplete,
    "- Local max points per aircraft: " + fmt(s.trails.localMaxPerAircraft?.max),
    "- Network max points per aircraft: " + fmt(s.trails.networkMaxPerAircraft?.max),
    "- Local/network above-limit aircraft max: " + fmt(s.trails.localOverLimitAircraft?.max) +
      " / " + fmt(s.trails.networkOverLimitAircraft?.max),
    "- Local/network at-limit aircraft max: " + fmt(s.trails.localAtLimitAircraft?.max) +
      " / " + fmt(s.trails.networkAtLimitAircraft?.max),
    "",
    "## Limitations",
    "",
    ...s.caveats.map((c) => "- " + c),
    "",
    "**Growing memory does not alone establish an application leak or justify changing trail limits.**",
    "",
  ].join("\n");
}

async function main() {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("authorization_missing");
  const base = new URL(process.env.T56_BASE_URL ?? "https://airradar.pomykal.cz");
  const trusted = base.protocol === "https:" && base.hostname === "airradar.pomykal.cz" &&
    (base.port === "" || base.port === "443");
  const loopback = base.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username || base.password || (!trusted && !loopback)) throw new Error("trusted_endpoint_required");

  const seconds = setting("T56_SECONDS", 3600, 1800, 7200);
  const interval = setting("T56_INTERVAL_SECONDS", 30, 15, 120);
  const warmup = setting("T56_WARMUP_SECONDS", 600, 0, 1800);
  if (warmup > seconds / 2) throw new Error("warmup_too_long");

  const output = process.env.T56_OUTPUT ??
    "/tmp/airradar-t56-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  if (!output.endsWith(".json")) throw new Error("json_output_required");
  const cookie = await login(base, token);
  const started = performance.now();
  const rows = [], unavailable = [];
  const count = Math.ceil(seconds / interval) + 1;
  for (let i = 0; i < count; i++) {
    const delay = started + i * interval * 1000 - performance.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      rows.push(await collect(base, cookie));
    } catch {
      if (i === 0) throw new Error("initial_memory_diagnostics_unavailable");
      unavailable.push({ at: new Date().toISOString(), reason: "read_only_sample_unavailable" });
    }
  }

  const summary = analyzeT56Samples(rows, unavailable, warmup);
  const report = {
    schemaVersion: 1,
    purpose: "AirRadar authorized, read-only T5.6 V8 memory and trail aggregate audit",
    generatedAt: new Date().toISOString(),
    configuredSeconds: seconds,
    intervalSeconds: interval,
    warmupSeconds: warmup,
    summary, rows, unavailable,
  };
  const reportMd = output.slice(0, -5) + ".md";
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(reportMd, markdown(summary), { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({
    report: output, markdown: reportMd, verdict: summary.verdict,
    samples: summary.samples, postMajorGcBaselines: summary.majorGcBaselines,
    stableProcessAndCommit: summary.stableProcessAndCommit,
  }, null, 2) + "\n");
  if (!summary.stableProcessAndCommit || summary.samples < 2) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Never log auth tokens, cookie values or raw response URLs.
    process.stderr.write("T5.6 memory audit failed: check private authentication and metrics availability.\n");
    process.exitCode = 1;
  });
}
