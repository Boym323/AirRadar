import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { login, fetchJson } from "./t53-navigation-production-sampler.mjs";

export const CANARY_SECONDS = 900;
export const INTERVAL_MS = 15_000;
const STARTUP_RETRYABLE = new Set([
  "canary_cpu_profile_not_enabled",
  "canary_evidence_state_mismatch",
  "canary_cpu_profile_invalid_stalls",
]);
const STARTUP_HTTP_RETRYABLE = /^Diagnostic request \/api\/(?:system\/(?:runtime-performance|status)|version) HTTP (?:502|503)$/;
const BASE = "https://airradar.pomykal.cz";
const SAFE_SCOPE = /^(?:snapshot|twin|history|network|health|atc|routeCache)\.[a-z][a-zA-Z0-9.-]{0,64}$/;

export function sanitizedStallEvent(raw) {
  if (!raw || !Number.isFinite(raw.overshootMs) || raw.overshootMs < 0) return null;
  const time = Date.parse(raw.observedAt);
  if (!Number.isFinite(time)) return null;
  const num = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0
    ? Math.round(Math.min(n, 600_000) * 1000) / 1000 : null;
  const name = typeof raw.correlatedScope?.name === "string" &&
    SAFE_SCOPE.test(raw.correlatedScope.name) ? raw.correlatedScope.name : null;
  return {
    observedAt: new Date(time).toISOString(),
    overshootMs: num(raw.overshootMs),
    intervalCpuPercent: num(raw.intervalCpuPercent),
    correlatedScope: name,
    overlapMs: name ? num(raw.correlatedScope.overlapMs) : null,
    gcPauseMs: num(raw.intervalGcPauseMs),
    gcCount: num(raw.intervalGcCount),
    majorGcCount: num(raw.intervalMajorGcCount),
    eventLoopActiveMs: num(raw.intervalEventLoopActiveMs),
    eventLoopIdleMs: num(raw.intervalEventLoopIdleMs),
  };
}

export function summarizeCanarySamples(samples) {
  const distinct = new Map();
  const values = (key) => samples.map((s) => s[key]).filter(Number.isFinite).sort((a,b)=>a-b);
  const percentile = (array, ratio) => array.length ? array[Math.ceil(array.length*ratio)-1] : null;
  const counts = {};
  let maxTotalStalls = 0;
  for (const sample of samples) {
    maxTotalStalls = Math.max(maxTotalStalls, sample.totalStalls ?? 0);
    for (const raw of sample.recentStalls ?? []) {
      const event = sanitizedStallEvent(raw);
      if (event) distinct.set(event.observedAt + ":" + event.overshootMs, event);
    }
  }
  const events = [...distinct.values()].sort((a,b)=>b.overshootMs-a.overshootMs);
  for (const e of events) {
    const key = e.correlatedScope ?? "unattributed";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return {
    sampleCount: samples.length,
    totalStalls: maxTotalStalls,
    distinctObservedStalls: events.length,
    worstOvershootMs: events[0]?.overshootMs ?? 0,
    cpuPercentP50: percentile(values("cpuPercent"), .5),
    cpuPercentP95: percentile(values("cpuPercent"), .95),
    rssMiBP50: percentile(values("rssMiB"), .5),
    eventLoopP99P95Ms: percentile(values("eventLoopP99Ms"), .95),
    correlationCounts: counts,
    gcContextEvents: events.filter((e) => e.gcPauseMs !== null && e.gcCount !== null).length,
    eventLoopUtilizationContextEvents: events.filter((e) =>
      e.eventLoopActiveMs !== null && e.eventLoopIdleMs !== null).length,
    topEvents: events.slice(0, 20),
    attribution: "temporal-overlap-not-causality",
    cpuProfile: samples.findLast((s) => s.cpuProfile?.status === "completed")?.cpuProfile ??
      samples.findLast((s) => s.cpuProfile?.status === "discarded")?.cpuProfile ?? null,
  };
}

export function sanitizedCpuProfile(raw) {
  if (!raw || !["starting", "running", "stopping", "completed", "discarded"].includes(raw.status)) {
    throw new Error("canary_cpu_profile_invalid_status");
  }
  const number = (value, max) => Number.isFinite(value) && value >= 0 && value <= max ? value : null;
  const safeFrame = (frame) => frame && typeof frame.frame === "string" && frame.frame.length <= 240 &&
    /^[A-Za-z_$(][A-Za-z0-9_$ .:()>-]{0,239}$/.test(frame.frame) &&
    ["javascript", "native", "gc", "idle", "unknown"].includes(frame.category) &&
    (frame.chunk === null || typeof frame.chunk === "string" && /^(?!.*\.\.)[A-Za-z0-9_.-]{1,80}\.js$/.test(frame.chunk)) &&
    (frame.line === null || Number.isSafeInteger(frame.line) && frame.line >= 0 && frame.line <= 1_000_000) &&
    (frame.column === null || Number.isSafeInteger(frame.column) && frame.column >= 0 && frame.column <= 1_000_000) &&
    Number.isSafeInteger(frame.samples) && frame.samples >= 0 && frame.samples <= 10_000;
  if (!Array.isArray(raw.stalls) || raw.stalls.length > 24 ||
      raw.stalls.some((stall) => !Array.isArray(stall.topFrames) || stall.topFrames.length > 8 ||
        stall.topFrames.some((frame) => !safeFrame(frame)))) {
    throw new Error("canary_cpu_profile_invalid_stalls");
  }
  return {
    status: raw.status,
    reason: typeof raw.reason === "string" && /^[a-z_]{1,40}$/.test(raw.reason) ? raw.reason : null,
    durationMs: number(raw.durationMs, 180_000), sampleIntervalUs: number(raw.sampleIntervalUs, 100_000),
    samples: number(raw.samples, 10_000), nodes: number(raw.nodes, 10_000),
    stalls: raw.stalls.map((stall) => ({
      observedAt: Number.isFinite(Date.parse(stall.observedAt)) ? new Date(stall.observedAt).toISOString() : null,
      overshootMs: number(stall.overshootMs, 180_000), cpuPercent: number(stall.cpuPercent, 1_000),
      gcPauseMs: number(stall.gcPauseMs, 180_000), gcCount: number(stall.gcCount, 10_000),
      mainThreadCpuMs: number(stall.mainThreadCpuMs, 180_000),
      schedulerWaitMs: number(stall.schedulerWaitMs, 180_000),
      schedulerSwitches: number(stall.schedulerSwitches, 100_000),
      sampledMs: number(stall.sampledMs, 180_000), sampleCount: number(stall.sampleCount, 10_000),
      topFrames: stall.topFrames.map((frame) => ({ frame: frame.frame, category: frame.category,
        chunk: frame.chunk, line: frame.line, column: frame.column, samples: frame.samples })),
    })),
  };
}

async function sessionCookie() {
  const session = await fetchJson(BASE, "/api/watchlist/session", null);
  if (session?.configured === false) return null;
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("canary_auth_unavailable");
  return login(BASE, token);
}

export function classifyStallEvidence(evidence, expectedState = "any") {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("canary_evidence_field_missing");
  }
  if (!Number.isSafeInteger(evidence.totalStalls) || evidence.totalStalls < 0 ||
      !Array.isArray(evidence.recentStalls)) {
    throw new Error("canary_evidence_invalid_structure");
  }
  if (evidence.status !== "disabled" && evidence.status !== "enabled") {
    throw new Error("canary_evidence_invalid_status");
  }
  if (expectedState !== "any" && evidence.status !== expectedState) {
    throw new Error("canary_evidence_state_mismatch");
  }
  return evidence.status;
}

async function sample(cookie, sha, enabled) {
  const [version, status, metrics] = await Promise.all([
    fetchJson(BASE, "/api/version", null),
    fetchJson(BASE, "/api/system/status", cookie),
    fetchJson(BASE, "/api/system/runtime-performance", cookie),
  ]);
  if (version.commit !== sha.slice(0,8) || version.channel !== "production") {
    throw new Error("canary_deployed_commit_changed");
  }
  if (status.nativeAcceleration?.rustActive !== true ||
      status.nativeAcceleration?.parserBackend !== "rust" ||
      status.nativeAcceleration?.crcBackend !== "rust") {
    throw new Error("canary_native_backend_unhealthy");
  }
  const evidence = metrics.stallEvidence;
  const evidenceStatus = classifyStallEvidence(evidence, enabled === null ? "any" : enabled ? "enabled" : "disabled");
  const cpuProfile = metrics.t58CpuProfile;
  if (enabled === null && cpuProfile?.status !== "disabled") {
    throw new Error("canary_cpu_profile_already_enabled");
  }
  if (enabled === true && (!cpuProfile || cpuProfile.status === "disabled")) {
    throw new Error("canary_cpu_profile_not_enabled");
  }
  if (enabled === false && cpuProfile?.status !== "disabled") {
    throw new Error("canary_cpu_profile_not_restored");
  }
  return {
    evidenceStatus,
    totalStalls: evidence.totalStalls,
    recentStalls: evidence.recentStalls,
    cpuPercent: metrics.runtime?.cpuIntervalPercent ?? null,
    rssMiB: Number.isFinite(metrics.runtime?.rssBytes) ? metrics.runtime.rssBytes/1048576 : null,
    eventLoopP99Ms: metrics.runtime?.eventLoopLagP99Ms ?? null,
    cpuProfile: enabled === true ? sanitizedCpuProfile(cpuProfile) : null,
  };
}

export async function sampleWithStartupRetry(readSample, { attempts = 10, delayMs = 3_000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await readSample();
    } catch (error) {
      const retryable = error instanceof Error && (
        STARTUP_RETRYABLE.has(error.message) || STARTUP_HTTP_RETRYABLE.test(error.message)
      );
      if (!retryable || attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("canary_startup_retry_exhausted");
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "preflight" && mode !== "observe" && mode !== "verify-restored") {
    throw new Error("canary_invalid_mode");
  }
  const sha = process.env.EXPECTED_SHA ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("canary_expected_commit_missing");
  if (mode === "verify-restored") {
    // A systemd restart can complete before the authenticated HTTP API is
    // available. Verify the recovered runtime, not merely the sudo exit code.
    // Fail closed on a changed production commit or broken Rust acceleration.
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const cookie = await sessionCookie();
        await sample(cookie, sha, false);
        console.log("CANARY_RESTORED");
        return;
      } catch (error) {
        if (error instanceof Error && (
          error.message === "canary_deployed_commit_changed" ||
          error.message === "canary_native_backend_unhealthy"
        )) throw error;
        if (attempt < 19) await new Promise((r) => setTimeout(r, 3_000));
      }
    }
    throw new Error("canary_rollback_unverified");
  }
  const cookie = await sessionCookie();
  if (mode === "preflight") {
    const current = await sample(cookie, sha, null);
    // Emit exactly one enum. Never reveal response bodies or session details.
    console.log(current.evidenceStatus === "enabled" ? "CANARY_ALREADY_ENABLED" : "CANARY_DISABLED");
    return;
  }
  const results = [], started = Date.now();
  for (let i=0; i<=CANARY_SECONDS*1000/INTERVAL_MS; i++) {
    if (i) await new Promise(r=>setTimeout(r, Math.max(0,started+i*INTERVAL_MS-Date.now())));
    results.push(await sampleWithStartupRetry(() => sample(cookie, sha, true)));
  }
  const output = process.env.T58_CANARY_OUTPUT;
  if (!output || !isAbsolute(output)) throw new Error("canary_invalid_report_path");
  const summary = { schemaVersion:1, releaseCommit:sha.slice(0,8),
    durationSeconds:CANARY_SECONDS, verdict:"COLLECTED_WITH_LIMITATIONS",
    ...summarizeCanarySamples(results) };
  if (summary.sampleCount !== 61) throw new Error("canary_incomplete_sample_count");
  if (summary.cpuProfile?.status !== "completed") throw new Error("canary_cpu_profile_incomplete");
  await writeFile(output, JSON.stringify(summary, null, 2)+"\n", {mode:0o600});
  console.log("[t58-canary] Saved sanitized report. Samples="+summary.sampleCount+
    " stalls="+summary.distinctObservedStalls+" worstMs="+summary.worstOvershootMs);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e)=>{
    const code=e instanceof Error && /^canary_[a-z_]+$/.test(e.message) ? e.message : "canary_failed";
    console.error("[t58-canary] "+code);
    process.exitCode=1;
  });
}
