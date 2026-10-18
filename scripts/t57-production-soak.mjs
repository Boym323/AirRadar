#!/usr/bin/env node
/**
 * T5.7C read-only 24-hour production soak. No restart, DB write, live-SSE
 * connection, forced GC, heap snapshot or raw diagnostic response storage.
 *
 * WATCHLIST_ADMIN_TOKEN must already be supplied securely in the environment.
 * T57_SECONDS=86400 T57_INTERVAL_SECONDS=60 node scripts/t57-production-soak.mjs
 * node scripts/t57-production-soak.mjs --analyze /tmp/airradar-t57-....ndjson
 *
 * Incremental NDJSON is private (0600) in a private 0700 directory; a killed
 * job still leaves evidence.
 */
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { login, fetchJson } from "./t53-navigation-production-sampler.mjs";
import { projectT57SoakSample, newT57Windows, analyzeT57Soak } from "./t57-soak-analysis.mjs";

const SESSION_REFRESH_MS = 6 * 3600 * 1000; // session expires after 8 h
const MAX_REPORT_BYTES = 50_000_000;

export const MIN_T57_SOAK_SECONDS = 1800;

export function durationSetting(name, fallback, min, max) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error("invalid_t57_schedule");
  return n;
}

export function scheduledPollDelayMs(scheduledAt, now = Date.now()) {
  return Math.max(0, scheduledAt - now);
}

export function classifyT57Failure(error) {
  const message = error instanceof Error ? error.message : "";
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (/authorization_missing|admin_auth_unavailable|session_login|HTTP (401|403)/i.test(message)) return "authentication_failure";
  if (name === "TimeoutError" || name === "AbortError" || /timeout/i.test(message)) return "http_timeout";
  if (/^t57_(admin|auxiliary|required|invalid|too_many|empty|report)/.test(message)) return "response_validation_failure";
  if (/Diagnostic request .* HTTP \d+/i.test(message)) return "http_failure";
  if (name === "TypeError" || /fetch failed|network/i.test(message)) return "network_failure";
  return "response_validation_failure";
}

export function isTransientT57Failure(error) {
  const message = error instanceof Error ? error.message : "";
  return /TimeoutError|AbortError|operation was aborted|timeout|fetch failed|network|HTTP (408|425|429|5\d\d)\b/i.test(message);
}

/** Retry only bounded, read-only diagnostic requests after transient failures. */
export async function fetchJsonWithRetry(base, path, cookie, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJson(base, path, cookie);
    } catch (error) {
      if (attempt >= attempts || !isTransientT57Failure(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error("t57_retry_exhausted");
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
    "- Sanitized unavailable-sample categories: " + JSON.stringify(report.failureCategories),
    "- Polling-delay context: " + JSON.stringify(report.pollingFailureContext),
    "- Process segments: " + report.segments + "; stable: " + report.stableProcessAndCommit,
    "- Primary process identity: " + fmt(report.segmentSummaries?.[0]?.processIdentity),
    "- Timestamp continuity gaps: " + (report.sampleGaps?.length ?? 0),
    "- Segment transitions: " + JSON.stringify(report.segmentChanges ?? []),
    "- Segment windows: " + JSON.stringify(report.segmentSummaries ?? []),
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
    "- Cgroup CPU throttle telemetry: " + JSON.stringify(report.cgroupCpuThrottleTelemetry),
    "- Completed 60-second event-loop p99 P50/P95/max: " +
      fmt(report.eventLoopWindowP99Ms?.p50) + " / " + fmt(report.eventLoopWindowP99Ms?.p95) +
      " / " + fmt(report.eventLoopWindowP99Ms?.max) + " ms",
    "",
    "## Route Cache V4/V5",
    "",
    "- Measured: " + (report.routeCache?.measured ? "yes" : "NOT MEASURED"),
    "- Phase latency P50/P95/P99 (ms): " + JSON.stringify(report.routeCache?.phaseLatencyMs ?? null),
    "- Counter deltas: " + JSON.stringify(report.routeCache?.countersDelta ?? null),
    "- Circuit OPEN samples/ratio: " + fmt(report.routeCache?.circuitOpenSamples) + " / " + fmt(report.routeCache?.circuitOpenSampleRatio),
    "- DB active max / writes max / rejected max: " + fmt(report.routeCache?.maxActiveDbOperations) + " / " + fmt(report.routeCache?.maxActiveDbWrites) + " / " + fmt(report.routeCache?.maxRejectedConcurrencyCounter),
    "- Caller timeouts delta / completed after timeout delta: " + fmt(report.routeCache?.callerTimeoutsDelta) + " / " + fmt(report.routeCache?.completedAfterCallerTimeoutDelta),
    "- Timer overshoot (process-local recent sample distributions): " + JSON.stringify(report.routeCache?.phaseLatencyMs?.callerTimeoutOvershoot ?? null),
    "- Event-loop utilization during timed-out calls, P95% series P50/P95/max: " +
      fmt(report.routeCache?.eventLoopAtTimeout?.p95Percent?.p50) + " / " +
      fmt(report.routeCache?.eventLoopAtTimeout?.p95Percent?.p95) + " / " +
      fmt(report.routeCache?.eventLoopAtTimeout?.p95Percent?.max),
    "- SQL latency scope: " + fmt(report.routeCache?.sqlLatencyMeasurement),
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
    "## Event-loop stall correlations (descriptive only)",
    "",
    JSON.stringify(report.stallCorrelations),
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
  // Open exactly once, reject symlinks, and read/stat the same descriptor.
  // A separate stat(path) then readFile(path) can race with path replacement.
  const input = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  let content;
  try {
    const info = await input.stat();
    if (!info.isFile() || info.size > MAX_REPORT_BYTES) throw new Error("report_too_large");
    content = await input.readFile({ encoding: "utf8" });
    // The file may grow while being read. Never analyze an oversized report.
    if (Buffer.byteLength(content, "utf8") > MAX_REPORT_BYTES) throw new Error("report_too_large");
  } finally {
    await input.close();
  }
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
    fetchJsonWithRetry(base, "/api/system/status", cookie),
    fetchJsonWithRetry(base, "/api/system/runtime-performance", cookie),
  ]);
  return projectT57SoakSample(status, metrics);
}

export async function establishSession(base, token) {
  const session = await fetchJson(base, "/api/watchlist/session", null);
  // Public diagnostics are intentionally sanitized. T57/T58 requires the
  // authenticated admin projection and must never silently fall back to it.
  if (session?.configured !== true) throw new Error("admin_auth_unavailable");
  if (!token) throw new Error("authorization_missing");
  return login(base, token);
}

// This check is intentionally also used by --preflight, before any 24h
// journal exists. The expected SHA is operator-supplied from /api/version.
export function verifyT57ExpectedCommit(commit, expectedCommit) {
  if (expectedCommit && !commit.startsWith(expectedCommit)) {
    throw new Error("unexpected_production_commit");
  }
}

/** Read-only authenticated telemetry preflight; no journal, worker or restart. */
async function preflight() {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  const base = trustedBase();
  const cookie = await establishSession(base, token);
  const observation = await collect(base, cookie);
  verifyT57ExpectedCommit(observation.identity.commit, process.env.T57_EXPECTED_COMMIT?.trim());
  return {
    status: "TELEMETRY_READY",
    version: observation.sample.version,
    commit: observation.identity.commit,
    // Deliberately exclude cookie, token, PID, process store ID and raw payload.
    requiredSources: ["admin-system-status", "runtime-performance", "retention-attribution"],
    operationalTwinForensicsEnabled: observation.sample.operationalTwinForensics?.enabled === true,
    reportCreated: false,
  };
}

async function run() {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  const base = trustedBase();
  const seconds = durationSetting("T57_TOTAL_SECONDS",
    durationSetting("T57_SECONDS", 86400, MIN_T57_SOAK_SECONDS, 86400),
    MIN_T57_SOAK_SECONDS, 86400);
  const chunkSeconds = durationSetting("T57_CHUNK_SECONDS", Math.min(seconds, 20_400), 60, 20_400);
  const intervalSeconds = durationSetting("T57_INTERVAL_SECONDS", 60, 30, 120);
  const warmupSeconds = durationSetting("T57_WARMUP_SECONDS", 600, 0, 1800);
  if (warmupSeconds > seconds / 2) throw new Error("warmup_too_long");
  const resume = process.env.T57_RESUME === "1";

  // Preflight: fail closed before creating the output file.
  let cookie = await establishSession(base, token);
  let authenticatedAt = Date.now();
  let initial = await collect(base, cookie);
  const expectedCommit = process.env.T57_EXPECTED_COMMIT?.trim();
  verifyT57ExpectedCommit(initial.identity.commit, expectedCommit);
  // mkdtemp atomically creates a private 0700 directory even though the
  // parent temporary directory is shared. Never place a predictable filename
  // directly in a world-writable directory.
  const privateDir = process.env.T57_OUTPUT ? null :
    await mkdtemp(join(tmpdir(), "airradar-t57-"));
  const output = process.env.T57_OUTPUT ?? join(privateDir, "soak.ndjson");
  if (!output.endsWith(".ndjson")) throw new Error("ndjson_output_required");
  if (privateDir === null) await mkdir(dirname(output), { recursive: true });

  let priorRecords = [];
  if (resume) {
    const journal = await open(output, constants.O_RDONLY | constants.O_NOFOLLOW);
    let priorText;
    try {
      const fileInfo = await journal.stat();
      if (!fileInfo.isFile() || fileInfo.size > MAX_REPORT_BYTES) throw new Error("invalid_resume_journal");
      priorText = await journal.readFile("utf8");
    } finally {
      await journal.close();
    }
    if (Buffer.byteLength(priorText) > MAX_REPORT_BYTES || !priorText.endsWith("\n")) throw new Error("invalid_resume_journal");
    priorRecords = priorText.trimEnd().split("\n").map((line) => JSON.parse(line));
    const header = priorRecords[0];
    if (header?.type !== "header" || header.schemaVersion !== 1 || header.seconds !== seconds ||
        header.intervalSeconds !== intervalSeconds ||
        (process.env.T57_MEASUREMENT_ID && header.measurementId !== process.env.T57_MEASUREMENT_ID)) {
      throw new Error("resume_identity_mismatch");
    }
  }
  const handle = await open(output, resume
    ? constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW
    : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let stopped = false;
  process.once("SIGINT", () => { stopped = true; });
  process.once("SIGTERM", () => { stopped = true; });
  const write = async (record) => handle.writeFile(JSON.stringify(record) + "\n");
  const priorSamples = priorRecords.filter((record) => record.type === "sample").map((record) => record.value);
  const lastSample = priorSamples.at(-1) ?? null;
  let segment = lastSample?.segment ?? 1;
  let previousIdentity = lastSample ? { processIdentity: lastSample.processIdentity,
    commit: lastSample.commit, version: lastSample.version } : { processIdentity: initial.sample.processIdentity,
    commit: initial.sample.commit, version: initial.sample.version };
  let failures = 0, written = 0;
  let checkpointValid = 0, checkpointUnavailable = 0, nextCheckpoint = 3600;
  const measurementId = priorRecords[0]?.measurementId ?? randomUUID();
  const cursors = new Map();
  for (const sample of priorSamples) {
    for (const [key, list] of [["event-loop", sample.eventLoopWindows],
      ...sample.hotPaths.map((path) => ["hot:" + path.name, path.windows])]) {
      const latest = list?.at(-1)?.to;
      if (latest) cursors.set(key, Date.parse(latest));
    }
  }
  const startedAt = priorRecords[0] ? new Date(priorRecords[0].startedAt) : new Date();
  const startEpoch = startedAt.getTime();
  const priorScheduledIndex = Number.isSafeInteger(lastSample?.scheduledIndex)
    ? lastSample.scheduledIndex : -1;
  const firstIndex = lastSample ? Math.max(
    Math.floor((Date.now() - startEpoch) / (intervalSeconds * 1000)) + 1,
    priorScheduledIndex + 1,
  ) : 0;
  const endIndex = Math.min(Math.ceil(seconds / intervalSeconds), firstIndex + Math.ceil(chunkSeconds / intervalSeconds) - 1);
  const chunkStartIndex = lastSample ? firstIndex : 0;
  let lastScheduledIndex = priorScheduledIndex >= 0
    ? priorScheduledIndex
    : lastSample ? Math.floor((Date.parse(lastSample.at) - startEpoch) / (intervalSeconds * 1000)) : -1;
  try {
    if (!resume) await write({ type: "header", schemaVersion: 1, measurementId,
      startedAt: startedAt.toISOString(), plannedEndAt: new Date(startEpoch + seconds * 1000).toISOString(),
      seconds, intervalSeconds, warmupSeconds });
    for (let i = chunkStartIndex; i <= endIndex && !stopped; i++) {
      if (i > lastScheduledIndex + 1) {
        for (let skipped = lastScheduledIndex + 1; skipped < i; skipped++) {
          await write({ type: "unavailable", at: new Date(startEpoch + skipped * intervalSeconds * 1000).toISOString(),
            category: "collection_interruption", pollDelayMs: null, pollDelayCategory: "interrupted_chunk" });
          failures++;
        }
      }
      const scheduledAt = startEpoch + i * intervalSeconds * 1000;
      const delay = scheduledPollDelayMs(scheduledAt);
      if (delay > 0) await new Promise((done) => setTimeout(done, delay));
      if (stopped) break;
      const pollDelayMs = Math.max(0, Date.now() - scheduledAt);
      try {
        if (Date.now() - authenticatedAt > SESSION_REFRESH_MS) {
          cookie = await establishSession(base, token);
          authenticatedAt = Date.now();
        }
        const observation = !lastSample && i === 0 ? initial : await collect(base, cookie);
        const processChanged = observation.sample.processIdentity !== previousIdentity.processIdentity;
        const commitChanged = observation.sample.commit !== previousIdentity.commit;
        const versionChanged = observation.sample.version !== previousIdentity.version;
        if (processChanged || commitChanged || versionChanged) {
          segment += 1;
          cursors.clear();
          await write({ type: "segment_change", at: new Date().toISOString(), segment,
            reason: [processChanged && "process_identity_changed", commitChanged && "commit_changed",
              versionChanged && "version_changed"].filter(Boolean) });
        }
        previousIdentity = { processIdentity: observation.sample.processIdentity,
          commit: observation.sample.commit, version: observation.sample.version };
        const sample = newT57Windows({ ...observation.sample, segment,
          pollDelayMs: Math.round(pollDelayMs),
          pollingDelayCategory: pollDelayMs > Math.max(5_000, intervalSeconds * 250)
            ? "delayed_polling" : null,
          failureCategory: null,
        }, cursors);
        await write({ type: "sample", value: { ...sample, scheduledIndex: i } });
        written++; checkpointValid++;
        const elapsedSeconds = Math.floor((Date.now() - startEpoch) / 1000);
        if (elapsedSeconds >= nextCheckpoint || (elapsedSeconds >= seconds && nextCheckpoint <= seconds)) {
          await write({ type: "checkpoint", value: {
            measurementId, at: new Date().toISOString(), elapsedSeconds,
            validSamples: checkpointValid, unavailableSamples: checkpointUnavailable,
            commit: sample.commit, version: sample.version, health: sample.health,
            aircraftCount: sample.aircraftCount, activeSseClients: sample.activeSseClients,
            cpuPercent: sample.cpuPercent, rssBytes: sample.rssBytes,
            routeCache: sample.routeCache,
          } });
          while (nextCheckpoint <= elapsedSeconds) nextCheckpoint += 3600;
          checkpointValid = 0; checkpointUnavailable = 0;
        }
      } catch (error) {
        if (i === 0 && !lastSample) throw new Error("initial_t57_sample_unavailable");
        failures++;
        checkpointUnavailable++;
        await write({ type: "unavailable", at: new Date().toISOString(), category: classifyT57Failure(error),
          pollDelayMs: Math.round(pollDelayMs),
          pollDelayCategory: pollDelayMs > Math.max(5_000, intervalSeconds * 250) ? "delayed_polling" : null });
        // The 8-hour admin cookie may expire or be invalidated; reauthenticate
        // on the next poll without writing credentials or error details.
        authenticatedAt = 0;
      }
      lastScheduledIndex = i;
      if (i % 10 === 0) await handle.sync();
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  // The report is deliberately not re-read until collection ends. An
  // interrupted run can be analyzed manually using --analyze OUTPUT.
  const logicalMeasurementComplete = lastScheduledIndex >= Math.ceil(seconds / intervalSeconds);
  const finalizeChunk = process.env.T57_FINALIZE_CHUNK === "1";
  if (!logicalMeasurementComplete && !finalizeChunk && Date.now() < startEpoch + seconds * 1000) {
    process.stdout.write(JSON.stringify({ status: "CHUNK_COMPLETE", measurementId,
      elapsedSeconds: Math.floor((Date.now() - startEpoch) / 1000), capturedSamples: written,
      unavailableSamples: failures, resumeRequired: true }, null, 2) + "\n");
    return;
  }
  const result = await analyzeFile(output);
  process.stdout.write(JSON.stringify({ ...result, unavailableSamples: failures,
    capturedSamples: written }, null, 2) + "\n");
  if (result.verdict !== "PASS_WITH_LIMITATIONS") process.exitCode = 2;
}

async function main() {
  if (process.argv[2] === "--preflight" && process.argv.length === 3) {
    process.stdout.write(JSON.stringify(await preflight(), null, 2) + "\n");
  } else if (process.argv[2] === "--analyze" && process.argv.length === 4) {
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
