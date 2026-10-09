#!/usr/bin/env node
/**
 * T5.3 read-only production sampler, using the existing authorized watchlist
 * session. Never removes authentication or writes passwords/cookies into
 * reports. Run on the AirRadar host with WATCHLIST_ADMIN_TOKEN exported.
 *
 * T53_BASE_URL=http://192.168.1.142:3000 T53_SECONDS=900 \
 * T53_INTERVAL_SECONDS=30 node scripts/t53-navigation-production-sampler.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

function clampInt(value, defaultValue, min, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : defaultValue;
}

export function navigationSample(diagnostics, status, runtime) {
  const memo = diagnostics?.navigationWriteMemo ?? {};
  const lane = status?.runtime?.autocommitOperationAttribution?.lanes?.["navigation.observation.create"] ?? {};
  const runtimeState = status?.runtime ?? {};
  const perf = runtime?.runtime ?? {};
  const safeInt = (v) => Number.isFinite(v) && v >= 0 ? v : null;
  return {
    observationsCreated: safeInt(diagnostics?.observationsCreated),
    persisted: safeInt(diagnostics?.persisted),
    deduplicated: safeInt(diagnostics?.deduplicated),
    memo: {
      avoidedUpserts: safeInt(memo.avoidedUpserts),
      confirmedKeys: safeInt(memo.confirmedKeys),
      inFlight: safeInt(memo.inFlight),
      ttlMs: safeInt(memo.ttlMs),
      maxKeys: safeInt(memo.maxKeys),
    },
    dbLane: {
      attempts: safeInt(lane.attempts),
      successes: safeInt(lane.successes),
      failures: safeInt(lane.failures),
      failureFamilies15m: lane.windows?.["15m"]?.failureFamilies ?? null,
    },
    runtime: {
      rssBytes: safeInt(perf.rssBytes ?? runtimeState.processRssBytes),
      heapUsedBytes: safeInt(perf.heapUsedBytes ?? runtimeState.heapUsedBytes),
      eventLoopLagP95Ms: safeInt(perf.eventLoopLagP95Ms),
    },
    phases: runtime?.phases ?? null,
    appVersion: status?.application?.version ?? null,
    appCommit: status?.application?.commit ?? null,
    diagnosticProcess: status?.runtime?.autocommitOperationAttribution?.processId ?? null,
    diagnosticStoreId: status?.runtime?.autocommitOperationAttribution?.diagnosticsStoreId ?? null,
  };
}

export function metricDelta(start, end, path) {
  const valueAt = (sample) => path.reduce((value, key) => value?.[key], sample);
  const first = valueAt(start);
  const last = valueAt(end);
  return Number.isFinite(first) && Number.isFinite(last) && last >= first ? last - first : null;
}

async function request(base, path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  return response;
}

async function login(base, token) {
  const result = await request(base, "/api/watchlist/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (result.status !== 200) throw new Error("Session login refused (HTTP " + result.status + ")");
  const cookie = result.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie?.startsWith("airradar_watchlist_session=")) {
    throw new Error("Session cookie missing after authorized login");
  }
  return cookie;
}

async function fetchJson(base, path, cookie) {
  const response = await request(base, path, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error("Diagnostic request " + path + " HTTP " + response.status);
  return response.json();
}

async function takeSample(base, cookie) {
  const [diag, status, runtime] = await Promise.all([
    fetchJson(base, "/api/admin/navigation-integrity/diagnostics", cookie),
    fetchJson(base, "/api/system/status", cookie),
    fetchJson(base, "/api/system/runtime-performance", cookie),
  ]);
  if (status.detailLevel !== "admin") throw new Error("Admin detail projection unavailable");
  if (diag.navigationWriteMemo?.scope !== "process-local") throw new Error("Write-memo diagnostics missing");
  return navigationSample(diag, status, runtime);
}

async function main() {
  const token = process.env.WATCHLIST_ADMIN_TOKEN?.trim();
  if (!token) throw new Error("WATCHLIST_ADMIN_TOKEN is required; no anonymous fallback");
  const base = process.env.T53_BASE_URL ?? "http://192.168.1.142:3000";
  const uri = new URL(base);
  if (uri.protocol !== "http:" && uri.protocol !== "https:") throw new Error("Invalid base URL protocol");
  const duration = clampInt(Number(process.env.T53_SECONDS ?? 900), 900, 60, 3600);
  const interval = clampInt(Number(process.env.T53_INTERVAL_SECONDS ?? 30), 30, 15, 120);
  const output = process.env.T53_OUTPUT ?? ("/tmp/airradar-t53-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
  const cookie = await login(base, token);
  const startedAt = new Date().toISOString();
  const rows = [];
  const errors = [];
  const iterations = Math.ceil(duration / interval) + 1;

  for (let index = 0; index < iterations; index += 1) {
    const at = new Date().toISOString();
    try {
      rows.push({ at, value: await takeSample(base, cookie) });
    } catch (error) {
      // Deliberately never print request headers, body, token, cookie, or
      // external error objects with potentially sensitive context.
      errors.push({ at, issue: "diagnostic_sample_unavailable" });
    }
    if (index + 1 < iterations) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    }
  }
  const first = rows[0]?.value;
  const last = rows.at(-1)?.value;
  const stable = Boolean(first && last && first.appCommit && first.appCommit === last.appCommit &&
    first.diagnosticProcess !== null && first.diagnosticProcess === last.diagnosticProcess &&
    first.diagnosticStoreId && first.diagnosticStoreId === last.diagnosticStoreId &&
    rows.every((row) => row.value.appCommit === first.appCommit &&
      row.value.diagnosticProcess === first.diagnosticProcess &&
      row.value.diagnosticStoreId === first.diagnosticStoreId));
  const totals = stable ? {
    avoidedUpserts: metricDelta(first, last, ["memo", "avoidedUpserts"]),
    dbAttempts: metricDelta(first, last, ["dbLane", "attempts"]),
    dbFailures: metricDelta(first, last, ["dbLane", "failures"]),
    observed: metricDelta(first, last, ["observationsCreated"]),
    persisted: metricDelta(first, last, ["persisted"]),
  } : null;
  const report = {
    schemaVersion: 1, purpose: "T5.3 authorized, read-only navigation performance",
    startedAt, finishedAt: new Date().toISOString(), intervalSeconds: interval,
    intendedDurationSeconds: duration, scope: "process-local",
    stableProcessAndCommit: stable, totals, samples: rows, unavailable: errors,
    limitations: [
      "Totals require identical process and application commit at first and last sample.",
      "Process-local memo counters are not equivalent to PostgreSQL WAL bytes.",
      "An actual DB-backed WAL comparison requires separate read-only PostgreSQL stats.",
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  process.stdout.write(JSON.stringify({
    report: output, collected: rows.length, unavailable: errors.length,
    stableProcessAndCommit: stable, totals,
  }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Errors are purposefully kept generic: don't leak credentials or URLs.
    process.stderr.write("Authorized T5.3 sampling failed; verify local config and session permissions.\n");
    process.exitCode = 1;
  });
}
