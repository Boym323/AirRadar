#!/usr/bin/env node
/**
 * T5.7C read-only 24-hour production soak. No restart, DB write, live-SSE
 * connection, forced GC, heap snapshot or raw diagnostic response storage.
 *
 * WATCHLIST_ADMIN_TOKEN must already be supplied securely in the environment.
 * T57_SECONDS=86400 T57_INTERVAL_SECONDS=60 node scripts/t57-production-soak.mjs
 * node scripts/t57-production-soak.mjs --analyze /tmp/airradar-t57-....ndjson
 *
 * Incremental NDJSON is private (0600); a killed job still leaves evidence.
 */
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { login, fetchJson } from "./t53-navigation-production-sampler.mjs";
import { projectT57SoakSample, newT57Windows, analyzeT57Soak } from "./t57-soak-analysis.mjs";

const SESSION_REFRESH_MS = 6 * 3600 * 1000; // session expires after 8 h
const MAX_REPORT_BYTES = 50_000_000;

function durationSetting(name, fallback, min, max) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error("invalid_t57_schedule");
  return n;
}

function trustedBase() {
  const uri = new URL(process.env.T57_BASE_URL ?? "https://airradar.pomykal.cz");
  const prod = uri.protocol === "https:" && uri.hostname === "airradar.pomykal.cz" &&
    (uri.port === "" || uri.port === "443");
  const local = uri.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname);
  if (uri.username || uri.password || uri.pathname !== "/" || uri.search || uri.hash || !(prod || local)) {
    throw new Error("trusted_endpoint_required");
  }
  return uri;
}

function markdown(report) {
  const fmt = (x) => x === null || x === undefined ? "unavailable" : String(x);
  const mem = report.memoryMiB;
  const lines = [
    "# AirRadar T5.7C – 24-hour read-only production soak",
    "",
    "**Verdict:** " + report.verdict,
    "",
    "- Commit/version: " + fmt(report.commit) + " / " + fmt(report.version),
    "- Valid / unavailable / planned samples: " + report.samples + " / " + report.missing + " / " + report.expected,
    "- Process segments: " + report.segments + "; stable: " + report.stableProcessAndCommit,
    "- Duration: " + fmt(report.durationSeconds) + " seconds",
    "- Distinct major GC observations: " + report.majorGcBaselines,
    "- Distinct completed event-loop windows: " + report.eventLoopWindows,
    "",
    "## Memory P50/P95/max (MiB)",
    "",
    "| Metric | P50 | P95 | Max |",
    "| --- | ---: | ---: | ---: |",
    ...Object.entries(mem).map(([k, v]) =>
      "| " + k + " | " + fmt(v?.p50) + " | " + fmt(v?.p95) + " | " + fmt(v?.max) + " |"),
    "",
    "## Post-major-GC trend (MiB)",
    "",
    ...Object.entries(report.postMajorGcTrendMiB).map(([k, v]) => "- " + k + ": " + fmt(v)),
    "",
    "## CPU and event loop",
    "",
    "- CPU interval P50/P95: " + fmt(report.cpuPercent?.p50) + " / " + fmt(report.cpuPercent?.p95) + " %",
    "- Completed 60-second event-loop p99 P50/P95/max: " +
      fmt(report.eventLoopWindowP99Ms?.p50) + " / " + fmt(report.eventLoopWindowP99Ms?.p95) +
      " / " + fmt(report.eventLoopWindowP99Ms?.max) + " ms",
    "",
    "## Retention",
    "",
    "- Over-limit aircraft observed: " + report.overLimit,
    "- Aircraft P50: " + fmt(report.load.aircraft?.p50),
    "- SSE clients P50: " + fmt(report.load.sseClients?.p50),
    "- Network trail points P50/max: " + fmt(report.load.networkTrailPoints?.p50) +
      " / " + fmt(report.load.networkTrailPoints?.max),
    "",
    "### Early/late steady-state decile difference (counts; not leak proof)",
    "",
    ...Object.entries(report.changesFirstLastDecile).map(([k, v]) => "- " + k + ": " + fmt(v)),
    "",
    "## CPU-attributed hot paths (completed windows, approximate)",
    "",
    "| Path | Windows | Calls | CPU ms | Wait ms | Max p99 ms |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.hotPathsByWindowCpuMs.map((p) => "| " + p.name + " | " + p.windows +
      " | " + p.calls + " | " + fmt(p.cpuMs) + " | " + fmt(p.waitMs) +
      " | " + fmt(p.p99MsMax) + " |"),
    "",
    "## Limitations",
    "",
    ...report.caveats.map((c) => "- " + c),
    "",
  ];
  return lines.join("\n");
}

export async function analyzeFile(file) {
  if (!file.endsWith(".ndjson")) throw new Error("ndjson_file_required");
  const size = (await stat(file)).size;
  if (size > MAX_REPORT_BYTES) throw new Error("report_too_large");
  const content = await readFile(file, "utf8");
  // A hard termination can leave the final NDJSON write incomplete. Keep
  // only newline-terminated records; never skip an invalid complete line.
  const committed = content.endsWith("\n") ? content : content.slice(0, content.lastIndexOf("\n") + 1);
  if (!committed.trim()) throw new Error("empty_t57_journal");
  const lines = committed.trimEnd().split("\n");
  if (lines.length > 3000) throw new Error("too_many_t57_rows");
  const records = lines.map((line) => JSON.parse(line));
  const result = analyzeT57Soak(records);
  const output = file.slice(0, -7);
  await writeFile(output + ".summary.json", JSON.stringify(result, null, 2) + "\n",
    { flag: "wx", mode: 0o600 });
  await writeFile(output + ".summary.md", markdown(result) + "\n",
    { flag: "wx", mode: 0o600 });
  return { verdict: result.verdict, samples: result.samples, missing: result.missing,
    segments: result.segments, report: output + ".summary.json", markdown: output + ".summary.md" };
}

async function collect(base, cookie) {
  const [status, metrics] = await Promise.all([
    fetchJson(base, "/api/system/status", cookie),
    fetchJson(base, "/api/system/runtime-performance", cookie),
  ]);
  return projectT57SoakSample(status, metrics);
}

async function run() {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("authorization_missing");
  const base = trustedBase();
  const seconds = durationSetting("T57_SECONDS", 86400, 3600, 86400);
  const intervalSeconds = durationSetting("T57_INTERVAL_SECONDS", 60, 30, 120);
  const warmupSeconds = durationSetting("T57_WARMUP_SECONDS", 600, 0, 1800);
  if (warmupSeconds > seconds / 2) throw new Error("warmup_too_long");

  // Preflight: fail closed before creating the output file.
  let cookie = await login(base, token);
  let authenticatedAt = Date.now();
  let initial = await collect(base, cookie);
  const expectedCommit = process.env.T57_EXPECTED_COMMIT?.trim();
  if (expectedCommit && !initial.identity.commit.startsWith(expectedCommit)) {
    throw new Error("unexpected_production_commit");
  }
  const output = process.env.T57_OUTPUT ??
    ("/tmp/airradar-t57-" + new Date().toISOString().replace(/[:.]/g, "-") + ".ndjson");
  if (!output.endsWith(".ndjson")) throw new Error("ndjson_output_required");
  await mkdir(dirname(output), { recursive: true });

  const handle = await open(output, "wx", 0o600);
  let stopped = false;
  process.once("SIGINT", () => { stopped = true; });
  process.once("SIGTERM", () => { stopped = true; });
  const write = async (record) => handle.writeFile(JSON.stringify(record) + "\n");
  let previousIdentity = initial.identity;
  let segment = 1, failures = 0, written = 0;
  const cursors = new Map();
  const started = performance.now();
  const count = Math.ceil(seconds / intervalSeconds) + 1;
  try {
    await write({ type: "header", schemaVersion: 1, startedAt: new Date().toISOString(),
      seconds, intervalSeconds, warmupSeconds });
    for (let i = 0; i < count && !stopped; i++) {
      const delay = started + i * intervalSeconds * 1000 - performance.now();
      if (delay > 0) await new Promise((done) => setTimeout(done, delay));
      if (stopped) break;
      try {
        if (Date.now() - authenticatedAt > SESSION_REFRESH_MS) {
          cookie = await login(base, token);
          authenticatedAt = Date.now();
        }
        const observation = i === 0 ? initial : await collect(base, cookie);
        const identity = observation.identity;
        if (identity.commit !== previousIdentity.commit ||
            identity.pid !== previousIdentity.pid || identity.storeId !== previousIdentity.storeId) {
          segment += 1;
          cursors.clear();
        }
        previousIdentity = identity;
        const sample = newT57Windows({ ...observation.sample, segment }, cursors);
        await write({ type: "sample", value: sample });
        written++;
      } catch {
        if (i === 0) throw new Error("initial_t57_sample_unavailable");
        failures++;
        await write({ type: "unavailable", at: new Date().toISOString() });
        // The 8-hour admin cookie may expire or be invalidated; reauthenticate
        // on the next poll without writing credentials or error details.
        authenticatedAt = 0;
      }
      if (i % 10 === 0) await handle.sync();
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  // The report is deliberately not re-read until collection ends. An
  // interrupted run can be analyzed manually using --analyze OUTPUT.
  const result = await analyzeFile(output);
  process.stdout.write(JSON.stringify({ ...result, unavailableSamples: failures,
    capturedSamples: written }, null, 2) + "\n");
  if (result.verdict !== "PASS_WITH_LIMITATIONS") process.exitCode = 2;
}

async function main() {
  if (process.argv[2] === "--analyze" && process.argv.length === 4) {
    const report = await analyzeFile(process.argv[3]);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (report.verdict !== "PASS_WITH_LIMITATIONS") process.exitCode = 2;
  } else if (process.argv.length === 2) {
    await run();
  } else {
    throw new Error("invalid_t57_arguments");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // No raw errors from HTTP, auth or FS paths are printed.
    process.stderr.write("T5.7 soak unavailable; verify authorized diagnostics and private report paths.\n");
    process.exitCode = 1;
  });
}
