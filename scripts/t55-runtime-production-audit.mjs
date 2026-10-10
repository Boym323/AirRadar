#!/usr/bin/env node
/**
 * T5.5 authorized, read-only 30-minute runtime audit.
 *
 * On the production host, with WATCHLIST_ADMIN_TOKEN in the environment:
 *   T55_SECONDS=1800 T55_INTERVAL_SECONDS=30 \
 *      node scripts/t55-runtime-production-audit.mjs
 *
 * Never logs or saves the secret, session cookies, raw aircraft data, or raw
 * API responses. Writes a mode-0600 JSON and Markdown analysis to /tmp.
 * No restarts, database writes, inspector or heap snapshots.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { login, fetchJson } from "./t53-navigation-production-sampler.mjs";
import { projectT55Sample, analyzeT55Samples } from "./t55-runtime-analysis.mjs";

function durationSetting(name, fallback, low, high) {
  const number = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(number) && number >= low && number <= high ? number : fallback;
}

function markdown(summary) {
  const fmt = (value, unit = "") => value === null || value === undefined ? "unavailable" : String(value) + unit;
  const ms = (summary.eventLoop?.p95Ms?.p95 ?? null);
  const rss = summary.memory?.rssMiB ?? null;
  const heap = summary.memory?.heapUsedMiB ?? null;
  const paths = summary.hotPathsByInstrumentedWallMs.map((path) =>
    "| " + path.name + " | " + path.wallMs + " | " + path.calls + " | " + path.intervals + " |").join("\n");
  return [
    "# AirRadar T5.5: Runtime sampling results",
    "",
    "**Result:** " + summary.verdict,
    "",
    "Production commit: \`" + (summary.commit ?? "unavailable") + "\`",
    "Production version: \`" + (summary.version ?? "unavailable") + "\`",
    "Valid samples: " + summary.samples + "; unavailable samples: " + summary.unavailableSamples,
    "Stable process + commit: " + summary.stableProcessAndCommit,
    "Sample span: " + fmt(summary.elapsedSeconds, " seconds"),
    "",
    "## CPU / event loop / GC",
    "",
    "- Measured CPU equivalent: " + fmt(summary.cpu.coreEquivalentPercent, "% of one CPU"),
    "- Sampled CPU p95: " + fmt(summary.cpu.intervalPercent?.p95, "% of one CPU"),
    "- Event-loop p95 of reported cumulative p95: " + fmt(ms, " ms"),
    "- GC events in window: " + fmt(summary.gc.eventsDelta),
    "- GC total pause time: " + fmt(summary.gc.pauseMsDelta, " ms"),
    "- GC wall-time ratio: " + fmt(summary.gc.wallPercent, "%"),
    "- RSS min/p95/max MiB: " + [rss?.min, rss?.p95, rss?.max].map(v => fmt(v)).join(" / "),
    "- Heap used min/p95/max MiB: " + [heap?.min, heap?.p95, heap?.max].map(v => fmt(v)).join(" / "),
    "- Navigation DB attempts/failures: " + fmt(summary.load.dbAttemptsDelta) + " / " + fmt(summary.load.dbFailuresDelta),
    "",
    "## Observational correlations",
    "",
    ...Object.entries(summary.correlations).map(([name, value]) => "- " + name + ": " + fmt(value)),
    "",
    "## Instrumented path deltas (wall-time only)",
    "",
    "| Path | Delta wall ms | Calls | Paired intervals |",
    "|---|---:|---:|---:|",
    paths || "| none | — | — | — |",
    "",
    "## Limitations",
    "",
    ...summary.caveats.map((item) => "- " + item),
    "",
    "**Do not make a CPU hotspot claim from instrumented async wall times alone.**",
    "If no attributable hotspot emerges, use a bounded DEV CPU profile before runtime changes.",
    "",
  ].join("\n");
}

async function collect(base, cookie) {
  const [status, metrics] = await Promise.all([
    fetchJson(base, "/api/system/status", cookie),
    fetchJson(base, "/api/system/runtime-performance", cookie),
  ]);
  return projectT55Sample(status, metrics);
}

async function main() {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("authorization_missing");
  const base = new URL(process.env.T55_BASE_URL ?? "https://airradar.pomykal.cz");
  if (base.protocol !== "https:" &&
      !(base.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(base.hostname))) {
    throw new Error("secure_endpoint_required");
  }
  const seconds = durationSetting("T55_SECONDS", 1800, 60, 3600);
  const interval = durationSetting("T55_INTERVAL_SECONDS", 30, 15, 120);
  const defaultOutput = "/tmp/airradar-t55-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
  const output = process.env.T55_OUTPUT ?? defaultOutput;
  if (!output.endsWith(".json")) throw new Error("json_output_required");
  const summaryPath = output.slice(0, -5) + ".md";
  const cookie = await login(base, token);
  const start = performance.now();
  const rows = [];
  const unavailable = [];
  const count = Math.ceil(seconds / interval) + 1;
  for (let i = 0; i < count; i++) {
    const targetAt = start + i * interval * 1000;
    const delay = targetAt - performance.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      rows.push(await collect(base, cookie));
    } catch {
      // Deliberately never stringify the thrown error (may contain URL/headers).
      unavailable.push({ at: new Date().toISOString(), reason: "read_only_sample_unavailable" });
    }
  }
  const summary = analyzeT55Samples(rows, unavailable);
  const report = {
    schemaVersion: 1,
    purpose: "AirRadar T5.5 authorized production CPU GC event-loop audit",
    generatedAt: new Date().toISOString(),
    configuredSeconds: seconds,
    intervalSeconds: interval,
    summary,
    rows,
    unavailable,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(summaryPath, markdown(summary), { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({
    report: output, markdown: summaryPath, verdict: summary.verdict,
    samples: summary.samples, unavailableSamples: summary.unavailableSamples,
    stableProcessAndCommit: summary.stableProcessAndCommit,
  }, null, 2) + "\n");
  if (summary.samples < 2 || !summary.stableProcessAndCommit) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("T5.5 authorized diagnostic collection failed. Review configuration and protected endpoint availability.\n");
    process.exitCode = 1;
  });
}
