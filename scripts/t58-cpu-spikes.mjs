#!/usr/bin/env node
/**
 * Short, read-only, authenticated CPU / cgroup CPU / V8 GC correlation probe.
 * Deliberately NEVER asks production to capture a CPU profile or heap snapshot.
 * Reads aggregate diagnostics only; no raw responses, credentials, PID or
 * diagnostics store ID are written. Requires existing deployed instrumentation.
 *
 * Node --test tests/t58-cpu-spikes.test.mjs
 * T58_SPIKE_SECONDS=120 T58_SPIKE_OUTPUT_DIR="$RUNNER_TEMP/t58-spikes" node scripts/t58-cpu-spikes.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { login, fetchJson } from "./t53-navigation-production-sampler.mjs";

const BASE = new URL("https://airradar.pomykal.cz/");
const SAMPLE_INTERVAL_MS = 5_000;
const HOT_PATHS = new Set([
  "snapshot.apply.total", "snapshot.local", "snapshot.network",
  "snapshot.operationalTwin", "twin.eventOutcome.local",
  "snapshot.trackFusion", "snapshot.trail-update",
  "history.persist", "network.metadata", "snapshot.navigationIntegrity",
]);
const MAX_SAMPLES = 130;
const finite = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const rounded = value => value === null ? null : Number(value.toFixed(3));
function percentile(values, fraction) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  return rounded(a[Math.min(a.length - 1, Math.ceil(a.length * fraction) - 1)]);
}

export function projectCpuSpikeSample(status, metrics, at = new Date().toISOString()) {
  const sys = status?.runtime;
  const runtime = metrics?.runtime;
  const key = sys?.autocommitOperationAttribution;
  if (status?.detailLevel !== "admin" || ![2, 3, 4].includes(metrics?.schemaVersion) ||
      metrics.scope !== "process-local" || runtime?.status !== "enabled" ||
      !/^[a-f0-9]{8,40}$/i.test(status?.application?.commit ?? "") ||
      !Number.isSafeInteger(key?.processId) ||
      typeof key?.diagnosticsStoreId !== "string" || !key.diagnosticsStoreId ||
      !Number.isFinite(Date.parse(at)) ||
      [runtime.cpuUserTimeMs, runtime.cpuSystemTimeMs,
       runtime.gcTotalPauseMs, runtime.gcCount, runtime.majorGcCount]
        .some(v => finite(v) === null)) {
    throw Error("t58_spike_required_telemetry_unavailable");
  }
  const allPaths = [
    ...(Array.isArray(metrics.hotPaths) ? metrics.hotPaths.slice(0, 25) : []),
    ...(Array.isArray(metrics.validatorPaths) ? metrics.validatorPaths.slice(0, 10) : []),
  ];
  const hotPaths = {};
  for (const item of allPaths) {
    if (HOT_PATHS.has(item?.name) && finite(item?.cpuMs) !== null) {
      hotPaths[item.name] = finite(item.cpuMs);
    }
  }
  return {
    // Identity is for fail-closed continuity validation only; NEVER serialize.
    identity: {
      commit: status.application.commit.toLowerCase(),
      processId: key.processId,
      storeId: key.diagnosticsStoreId,
    },
    // Explicit allowlist. All source fields are numeric, except ISO timestamp
    // and public commit/version. No aircraft data or provider payload.
    sample: {
      at: new Date(at).toISOString(),
      commit: status.application.commit.toLowerCase(),
      version: typeof status.application.version === "string"
        ? status.application.version.slice(0, 40) : null,
      cpuUserMs: finite(runtime.cpuUserTimeMs),
      cpuSystemMs: finite(runtime.cpuSystemTimeMs),
      gcTotalPauseMs: finite(runtime.gcTotalPauseMs),
      gcCount: finite(runtime.gcCount),
      majorGcCount: finite(runtime.majorGcCount),
      gcRecentMaxPauseMs: finite(runtime.gcMaxPauseMs),
      eventLoopP99Ms: finite(runtime.eventLoopLagP99Ms),
      quotaCores: finite(sys.cgroupCpuQuotaCores),
      nrThrottled: finite(sys.cgroupCpuNrThrottled),
      throttledUsec: finite(sys.cgroupCpuThrottledUsec),
      aircraftCount: finite(sys.aircraftCount),
      hotPaths,
    },
  };
}

function deltaCount(prev, next) {
  if (prev === null || next === null || next < prev) return null;
  return next - prev;
}
export function analyzeCpuSpikeSamples(samples) {
  if (!Array.isArray(samples) || samples.length < 5 || samples.length > MAX_SAMPLES)
    throw Error("t58_spike_insufficient_or_unbounded_samples");
  const version = samples[0]?.version;
  const commit = samples[0]?.commit;
  if (samples.some(s => s.commit !== commit || s.version !== version))
    throw Error("t58_spike_version_changed");
  const intervals = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1], next = samples[i];
    const elapsedMs = Date.parse(next.at) - Date.parse(prev.at);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 500 || elapsedMs > 15_000)
      throw Error("t58_spike_invalid_sample_spacing");
    const cpuUserMs = deltaCount(prev.cpuUserMs, next.cpuUserMs);
    const cpuSystemMs = deltaCount(prev.cpuSystemMs, next.cpuSystemMs);
    const gcPauseMs = deltaCount(prev.gcTotalPauseMs, next.gcTotalPauseMs);
    const gcCount = deltaCount(prev.gcCount, next.gcCount);
    const majorGcCount = deltaCount(prev.majorGcCount, next.majorGcCount);
    if ([cpuUserMs, cpuSystemMs, gcPauseMs, gcCount, majorGcCount].some(v => v === null))
      throw Error("t58_spike_counter_reset_or_missing");
    const throttledEvents = deltaCount(prev.nrThrottled, next.nrThrottled);
    const throttledUsec = deltaCount(prev.throttledUsec, next.throttledUsec);
    const pathCpuMs = {};
    for (const name of HOT_PATHS) {
      const delta = deltaCount(prev.hotPaths[name] ?? null, next.hotPaths[name] ?? null);
      if (delta !== null) pathCpuMs[name] = rounded(delta);
    }
    const cpuPercent = rounded((cpuUserMs + cpuSystemMs) / elapsedMs * 100);
    const gcPausePercent = rounded(gcPauseMs / elapsedMs * 100);
    const throttledTimePercent = throttledUsec === null ? null
      : rounded(throttledUsec / (elapsedMs * 1000) * 100);
    intervals.push({
      at: next.at,
      elapsedMs,
      cpuPercent, // normalized to ONE core; may exceed 100 on multicore.
      cpuUserMs: rounded(cpuUserMs), cpuSystemMs: rounded(cpuSystemMs),
      gcPauseMs: rounded(gcPauseMs), gcCount, majorGcCount, gcPausePercent,
      eventLoopP99Ms: next.eventLoopP99Ms,
      quotaCores: next.quotaCores, aircraftCount: next.aircraftCount,
      throttledEvents, throttledUsec, throttledTimePercent,
      // No double counting: nested path CPU values are independent timings.
      hottestPaths: Object.entries(pathCpuMs)
        .sort((a,b) => b[1] - a[1]).slice(0, 4)
        .map(([name, cpuMs]) => ({ name, cpuMs })),
      hotPathCoverage: Object.keys(pathCpuMs).length,
      spike: cpuPercent >= 85 || (throttledEvents !== null && throttledEvents > 0) ||
        (next.eventLoopP99Ms !== null && next.eventLoopP99Ms >= 200),
    });
  }
  const th = intervals.filter(x => x.throttledEvents !== null && x.throttledUsec !== null);
  const throttledIntervals = th.filter(x => x.throttledEvents > 0 || x.throttledUsec > 0);
  const gcPauseTotalMs = intervals.reduce((v,x)=>v+x.gcPauseMs,0);
  const elapsedTotalMs = intervals.reduce((v,x)=>v+x.elapsedMs,0);
  const cpu = intervals.map(x=>x.cpuPercent);
  const quota = samples.map(x=>x.quotaCores).find(v=>v!==null) ?? null;
  const spikes = intervals.filter(x=>x.spike);
  const interpretation = [];
  if (th.length < intervals.length) interpretation.push(
    "Cgroup throttling telemetry is missing in some/all intervals: cannot rule out throttling.");
  else if (throttledIntervals.length) interpretation.push(
    "Cgroup throttling counter increased; causality of CPU or event-loop spikes is NOT established.");
  else interpretation.push("No cgroup throttling counter increase was observed during this bounded run.");
  interpretation.push(
    "GC pause share is descriptive. Node perf_hooks GC measures V8 observed pauses, not all scheduler stalls; it cannot prove or exclude a specific event-loop stall.");
  interpretation.push(
    "Named hot-path counters are inclusive/overlapping and may be missing; values are not flamegraph stacks. Aggregate CPU percent is normalized to one core.");
  return {
    schemaVersion: 1,
    kind: "t58-cpu-spike-readonly",
    generatedAt: new Date().toISOString(),
    source: { commit, version, samplingIntervalSeconds: SAMPLE_INTERVAL_MS / 1000,
      samples: samples.length, intervals: intervals.length,
      aircraftP50: percentile(samples.map(x=>x.aircraftCount).filter(x=>x!==null),.5) },
    cpu: { p50Percent: percentile(cpu,.5), p95Percent: percentile(cpu,.95),
      maxPercent: rounded(Math.max(...cpu)), thresholdPercent: 85,
      spikeCount: spikes.length },
    cgroup: { quotaCores: quota, observedIntervals: th.length,
      unavailableIntervals: intervals.length - th.length,
      throttledIntervals: throttledIntervals.length,
      totalNrThrottled: th.reduce((v,x)=>v+x.throttledEvents,0),
      totalThrottledUsec: th.reduce((v,x)=>v+x.throttledUsec,0),
      coverageComplete: th.length === intervals.length },
    gc: { gcCount: intervals.reduce((v,x)=>v+x.gcCount,0),
      majorGcCount: intervals.reduce((v,x)=>v+x.majorGcCount,0),
      totalPauseMs: rounded(gcPauseTotalMs),
      pauseTimeSharePercent: rounded(gcPauseTotalMs/elapsedTotalMs*100),
      pauseIntervalP95Ms: percentile(intervals.map(x=>x.gcPauseMs),.95),
      highestObservedRecentPauseMs: Math.max(...samples.map(x=>x.gcRecentMaxPauseMs??0)) },
    eventLoop: { rollingP99P95Ms: percentile(intervals.map(x=>x.eventLoopP99Ms)
      .filter(x=>x!==null),.95) },
    spikes: spikes.slice(0,40),
    intervals, interpretation,
    limitations: [
      "read-only diagnostic snapshots; no actual JS stack CPU profile",
      "not controlled same-workload testing; depends on traffic and other processes",
      "intra-5-second GC pause and event-loop stalls are not aligned at individual-event resolution",
      "cgroup counters include all tasks sharing the process cgroup",
      "missing cgroup metrics are NOT zero; quota null can also mean unlimited",
      "hot path counters are inclusive/overlapping and not additive",
    ],
  };
}

export function cpuSpikeMarkdown(report) {
  const { source, cpu, cgroup, gc, eventLoop } = report;
  const yes = v => v === null ? "N/A" : String(v);
  return [
    "# T58 – short, read-only CPU spike / cgroup / GC diagnosis",
    "", `Commit/version: \`${source.commit}\` / \`${source.version}\``,
    `Valid samples: **${source.samples}** at 5-second intervals; aircraft P50: ${yes(source.aircraftP50)}`,
    "", "## Observations", "",
    "| Metric | Value |", "|---|---:|",
    `| Process CPU P50 / P95 / max (% of one core) | ${yes(cpu.p50Percent)} / ${yes(cpu.p95Percent)} / ${yes(cpu.maxPercent)} |`,
    `| Flagged CPU/throttling/lag intervals | ${cpu.spikeCount} |`,
    `| Rolling event-loop P99 P95 (ms) | ${yes(eventLoop.rollingP99P95Ms)} |`,
    `| Cgroup quota (cores) | ${yes(cgroup.quotaCores)} |`,
    `| Cgroup counters present | ${cgroup.observedIntervals}/${source.intervals} intervals |`,
    `| Cgroup throttle events / time (us) | ${cgroup.totalNrThrottled} / ${cgroup.totalThrottledUsec} |`,
    `| GC count (major) | ${gc.gcCount} (${gc.majorGcCount}) |`,
    `| GC pause total (ms) | ${gc.totalPauseMs} |`,
    `| GC paused wall-time share | ${gc.pauseTimeSharePercent}% |`,
    "", "## Highest observed candidate CPU paths (inclusive, not additive)", "",
    "| UTC | Process CPU % | GC pause ms | Throttle count | Candidate paths |",
    "|---|---:|---:|---:|---|",
    ...report.spikes.slice(0,15).map(row =>
      `| ${row.at} | ${row.cpuPercent} | ${row.gcPauseMs} | ${yes(row.throttledEvents)} | ${row.hottestPaths.map(x=>x.name+":"+x.cpuMs+"ms").join(", ") || "N/A"} |`),
    "", "## Interpretation", "", ...report.interpretation.map(s=>"- "+s),
    "", "## Limits", "", ...report.limitations.map(s=>"- "+s), "",
  ].join("\n");
}

function requireSeconds() {
  const n = Number(process.env.T58_SPIKE_SECONDS ?? 120);
  if (n !== 120 && n !== 600) throw Error("t58_spike_invalid_schedule");
  return n;
}
async function session() {
  const challenge = await fetchJson(BASE, "/api/watchlist/session", null);
  if (challenge?.configured === false) return null;
  if (!process.env.WATCHLIST_ADMIN_TOKEN?.trim()) throw Error("t58_spike_authorization_missing");
  return login(BASE, process.env.WATCHLIST_ADMIN_TOKEN.trim());
}
async function getSample(cookie) {
  const [status, performanceMetrics] = await Promise.all([
    fetchJson(BASE, "/api/system/status", cookie),
    fetchJson(BASE, "/api/system/runtime-performance", cookie),
  ]);
  return projectCpuSpikeSample(status, performanceMetrics);
}
export async function main() {
  const seconds = requireSeconds();
  const cookie = await session();
  const beginning = await getSample(cookie);
  const baseIdentity = beginning.identity;
  const observations = [beginning.sample];
  let next = performance.now();
  const end = next + seconds * 1_000;
  while (next + SAMPLE_INTERVAL_MS <= end + 100) {
    next += SAMPLE_INTERVAL_MS;
    await new Promise(done=>setTimeout(done,Math.max(0,next-performance.now())));
    const current = await getSample(cookie);
    if (current.identity.commit !== baseIdentity.commit ||
        current.identity.processId !== baseIdentity.processId ||
        current.identity.storeId !== baseIdentity.storeId)
      throw Error("t58_spike_deployed_process_changed");
    observations.push(current.sample);
    if (observations.length > MAX_SAMPLES) throw Error("t58_spike_bounded_limit");
  }
  const report = analyzeCpuSpikeSamples(observations);
  const directory = resolve(process.env.T58_SPIKE_OUTPUT_DIR ??
    ".benchmarks/t58-cpu-spikes");
  await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(resolve(directory,"summary.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
  await writeFile(resolve(directory,"summary.md"),cpuSpikeMarkdown(report)+"\n",{flag:"wx",mode:0o600});
  process.stdout.write(cpuSpikeMarkdown(report)+"\n");
}
if (process.argv[1]?.endsWith("t58-cpu-spikes.mjs")) {
  main().catch(error=>{
    const name=error instanceof Error?error.message:"t58_spike_unknown_failure";
    console.error(/^t58_spike_[a-z_]+$/.test(name)?name:"t58_spike_collection_failed");
    process.exitCode=1;
  });
}
