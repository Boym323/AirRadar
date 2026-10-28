#!/usr/bin/env node
import "dotenv/config";
import { mkdir, appendFile, chmod, readdir, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { createHash, createHmac } from "node:crypto";

export const MONITOR_SCHEMA_VERSION = 1;
const DEFAULT_RETENTION_DAYS = 14;

function finite(value) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function nonNegative(value) { const n = finite(value); return n === null || n < 0 ? null : n; }
function requiredEnv(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }

export function createProcessFingerprint(application) {
  const startedAt = typeof application?.startedAt === "string" && Number.isFinite(Date.parse(application.startedAt))
    ? new Date(Date.parse(application.startedAt)).toISOString() : null;
  const commit = typeof application?.commit === "string" && /^[0-9a-f]{7,64}$/i.test(application.commit.trim())
    ? application.commit.trim().toLowerCase() : null;
  if (!startedAt || !commit) return null;
  return createHash("sha256").update(`airradar-process-v1\0${startedAt}\0${commit}`).digest("hex");
}

export function createAdminCookie(token, now = Date.now()) {
  if (!token?.trim()) throw new Error("admin token is required");
  const expiresAt = Math.floor(now / 1000) + 8 * 60 * 60;
  const signature = createHmac("sha256", token.trim()).update(String(expiresAt)).digest("base64url");
  return `airradar_watchlist_session=${expiresAt}.${signature}`;
}

export function projectRuntimeTelemetry(payload) {
  // The real route deliberately does not expose a detailLevel field. Admin
  // access is proven by the schema-4 fields omitted by toPublicRuntimePerformance.
  if (payload?.schemaVersion !== 4 || payload.scope !== "process-local") {
    throw new Error("admin runtime telemetry contract unavailable");
  }
  const runtime = payload.runtime;
  if (runtime?.status !== "enabled") throw new Error("runtime observation is disabled");
  const values = {
    cpuIntervalPercent: nonNegative(runtime.cpuIntervalPercent),
    cpuUserTimeMs: nonNegative(runtime.cpuUserTimeMs),
    cpuSystemTimeMs: nonNegative(runtime.cpuSystemTimeMs),
    rssBytes: nonNegative(runtime.rssBytes),
    heapUsedBytes: nonNegative(runtime.heapUsedBytes),
    eventLoopP95Ms: nonNegative(runtime.eventLoopLagP95Ms),
    eventLoopP99Ms: nonNegative(runtime.eventLoopLagP99Ms),
    eventLoopWindows: Array.isArray(runtime.eventLoopLagWindows) ? runtime.eventLoopLagWindows.slice(-15).map((window) => ({
      from: typeof window?.from === "string" ? window.from : null,
      to: typeof window?.to === "string" ? window.to : null,
      p95Ms: nonNegative(window?.p95Ms), p99Ms: nonNegative(window?.p99Ms), maxMs: nonNegative(window?.maxMs),
    })) : [],
  };
  if ([values.cpuIntervalPercent, values.rssBytes, values.eventLoopP99Ms].some((value) => value === null)) {
    throw new Error("required runtime telemetry missing");
  }
  return values;
}

async function fetchRuntime(baseUrl, cookie) {
  const response = await fetch(new URL("/api/system/runtime-performance", baseUrl), {
    headers: { cookie }, signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  if (!response.ok) throw new Error(`runtime endpoint HTTP ${response.status}`);
  return projectRuntimeTelemetry(await response.json());
}

async function fetchProcessFingerprint(baseUrl, cookie) {
  const response = await fetch(new URL("/api/system/status", baseUrl), {
    headers: { cookie }, signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  if (!response.ok) throw new Error(`system status endpoint HTTP ${response.status}`);
  const fingerprint = createProcessFingerprint((await response.json())?.application);
  if (!fingerprint) throw new Error("process identity unavailable");
  return fingerprint;
}

async function query(client, text) { return (await client.query(text)).rows; }

async function optionalQuery(client, savepoint, text) {
  try {
    await client.query(`SAVEPOINT ${savepoint}`);
    const rows = await query(client, text);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return rows;
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return [];
  }
}

export async function collectDatabase(client) {
  await client.query("BEGIN TRANSACTION READ ONLY");
  try {
    const database = (await query(client, `
      SELECT datname, xact_commit::bigint, xact_rollback::bigint,
        tup_inserted::bigint, tup_updated::bigint, tup_deleted::bigint,
        blks_read::bigint, blks_hit::bigint, temp_files::bigint,
        temp_bytes::bigint, stats_reset
      FROM pg_stat_database WHERE datname = current_database()`))[0] ?? null;
    const wal = (await optionalQuery(client, "airradar_wal", `SELECT wal_records::bigint, wal_fpi::bigint,
      wal_bytes::numeric, wal_buffers_full::bigint, stats_reset FROM pg_stat_wal`))[0] ?? null;
    const activity = (await query(client, `
      SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
        count(*) FILTER (WHERE wait_event IS NOT NULL)::int AS waiting,
        count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waiting,
        count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_transaction
      FROM pg_stat_activity WHERE datname = current_database()`))[0] ?? null;
    const statements = (await optionalQuery(client, "airradar_statements", `
      SELECT count(*)::int AS statement_count, coalesce(sum(calls), 0)::bigint AS calls,
        coalesce(sum(total_exec_time), 0)::double precision AS total_exec_time_ms,
        coalesce(max(mean_exec_time), 0)::double precision AS max_mean_exec_time_ms
      FROM pg_stat_statements`))[0] ?? null;
    await client.query("COMMIT");
    return { database, wal, activity, statementsAvailable: statements !== null, statements };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the original database error. */ }
    throw error;
  }
}

async function fetchHostCpu() {
  const endpoint = process.env.AIRRADAR_MONITOR_NODE_EXPORTER_URL?.trim();
  if (!endpoint) return { status: "unavailable", reason: "not_configured" };
  const url = new URL("metrics", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  if (url.protocol !== "http:" && url.protocol !== "https:") return { status: "unavailable", reason: "unsupported_scheme" };
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: "error" });
    if (!response.ok) return { status: "unavailable", reason: `http_${response.status}` };
    const text = await response.text();
    const idle = [...text.matchAll(/^node_cpu_seconds_total\{[^}]*mode="idle"[^}]*\}\s+([\d.eE+-]+)$/gm)].reduce((s, m) => s + Number(m[1]), 0);
    const total = [...text.matchAll(/^node_cpu_seconds_total\{[^}]*mode="[^"]+"[^}]*\}\s+([\d.eE+-]+)$/gm)].reduce((s, m) => s + Number(m[1]), 0);
    return total > 0 && idle >= 0 ? { status: "available", idleSeconds: idle, totalSeconds: total } : { status: "unavailable", reason: "metric_missing" };
  } catch { return { status: "unavailable", reason: "request_failed" }; }
}

export async function collectSample({ baseUrl, cookie, databaseUrl, now = new Date() }) {
  const client = new Client({ connectionString: databaseUrl, max: 1, application_name: "airradar-readonly-monitor" });
  await client.connect();
  try {
    const [runtime, processFingerprint, database, hostCpu] = await Promise.all([
      fetchRuntime(baseUrl, cookie), fetchProcessFingerprint(baseUrl, cookie), collectDatabase(client), fetchHostCpu(),
    ]);
    return { schemaVersion: MONITOR_SCHEMA_VERSION, recordedAt: now.toISOString(), processFingerprint, runtime, database, hostCpu };
  } finally { await client.end(); }
}

async function prune(directory, retentionDays) {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const name of await readdir(directory)) {
    if (!/^sample-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) continue;
    try { if ((await stat(join(directory, name))).mtimeMs < cutoff) await unlink(join(directory, name)); } catch { /* race-safe retention */ }
  }
}

export async function writeSample(sample, directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const file = join(directory, `sample-${sample.recordedAt.slice(0, 10)}.jsonl`);
  await appendFile(file, `${JSON.stringify(sample)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  await prune(directory, Math.min(90, Math.max(1, Number(process.env.AIRRADAR_MONITOR_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS))));
  return file;
}

export async function runOnce() {
  const baseUrl = requiredEnv("AIRRADAR_MONITOR_BASE_URL");
  const cookie = process.env.AIRRADAR_MONITOR_ADMIN_COOKIE?.trim()
    || (process.env.AIRRADAR_MONITOR_ADMIN_TOKEN ? createAdminCookie(process.env.AIRRADAR_MONITOR_ADMIN_TOKEN) : null);
  if (!cookie) throw new Error("AIRRADAR_MONITOR_ADMIN_COOKIE or AIRRADAR_MONITOR_ADMIN_TOKEN is required");
  const databaseUrl = requiredEnv("DATABASE_URL");
  const sample = await collectSample({ baseUrl, cookie, databaseUrl });
  const file = await writeSample(sample, process.env.AIRRADAR_MONITOR_OUTPUT_DIR ?? "/var/lib/airradar/monitoring");
  return { recordedAt: sample.recordedAt, file, hostCpu: sample.hostCpu.status };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOnce().then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
