import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { login, fetchJson } from "./t53-navigation-production-sampler.mjs";

export const CANARY_SECONDS = 900;
export const INTERVAL_MS = 15_000;
const BASE = "https://airradar.pomykal.cz";
const SAFE_SCOPE = /^(?:snapshot|twin|history|network|health|atc|routeCache)\.[a-z][a-zA-Z0-9.-]{0,64}$/;

export function sanitizedStallEvent(raw) {
  if (!raw || !Number.isFinite(raw.overshootMs) || raw.overshootMs < 0) return null;
  const time = Date.parse(raw.observedAt);
  if (!Number.isFinite(time)) return null;
  const num = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0
    ? Math.round(n * 1000) / 1000 : null;
  const name = typeof raw.correlatedScope?.name === "string" &&
    SAFE_SCOPE.test(raw.correlatedScope.name) ? raw.correlatedScope.name : null;
  return {
    observedAt: new Date(time).toISOString(),
    overshootMs: num(raw.overshootMs),
    intervalCpuPercent: num(raw.intervalCpuPercent),
    correlatedScope: name,
    overlapMs: name ? num(raw.correlatedScope.overlapMs) : null,
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
    topEvents: events.slice(0, 20),
    attribution: "temporal-overlap-not-causality",
  };
}

async function sessionCookie() {
  const session = await fetchJson(BASE, "/api/watchlist/session", null);
  if (session?.configured === false) return null;
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("canary_auth_unavailable");
  return login(BASE, token);
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
  if (!evidence || evidence.status !== (enabled ? "enabled" : "disabled") ||
      !Number.isSafeInteger(evidence.totalStalls) || !Array.isArray(evidence.recentStalls)) {
    throw new Error("canary_evidence_unavailable");
  }
  return {
    totalStalls: evidence.totalStalls,
    recentStalls: evidence.recentStalls,
    cpuPercent: metrics.runtime?.cpuIntervalPercent ?? null,
    rssMiB: Number.isFinite(metrics.runtime?.rssBytes) ? metrics.runtime.rssBytes/1048576 : null,
    eventLoopP99Ms: metrics.runtime?.eventLoopLagP99Ms ?? null,
  };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "preflight" && mode !== "observe") throw new Error("canary_invalid_mode");
  const sha = process.env.EXPECTED_SHA ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("canary_expected_commit_missing");
  const cookie = await sessionCookie();
  if (mode === "preflight") {
    await sample(cookie, sha, false);
    console.log("[t58-canary] Read-only preflight passed.");
    return;
  }
  const results = [], started = Date.now();
  for (let i=0; i<=CANARY_SECONDS*1000/INTERVAL_MS; i++) {
    if (i) await new Promise(r=>setTimeout(r, Math.max(0,started+i*INTERVAL_MS-Date.now())));
    results.push(await sample(cookie, sha, true));
  }
  const output = process.env.T58_CANARY_OUTPUT;
  if (!output || !isAbsolute(output)) throw new Error("canary_invalid_report_path");
  const summary = { schemaVersion:1, releaseCommit:sha.slice(0,8),
    durationSeconds:CANARY_SECONDS, verdict:"COLLECTED_WITH_LIMITATIONS",
    ...summarizeCanarySamples(results) };
  if (summary.sampleCount !== 61) throw new Error("canary_incomplete_sample_count");
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
