import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const durationMs = Math.max(60_000, Number(process.env.DB_WRITE_AUDIT_DURATION_MS ?? 30 * 60_000));
const artifact = process.env.DB_WRITE_AUDIT_ARTIFACT ?? "artifacts/db-write-amplification-audit.json";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function query(text) { return (await pool.query(text)).rows; }
async function capture(label) {
  const tables = await query(`
    select c.relname as table_name, coalesce(s.n_tup_ins,0)::bigint as n_tup_ins,
      coalesce(s.n_tup_upd,0)::bigint as n_tup_upd, coalesce(s.n_tup_del,0)::bigint as n_tup_del,
      coalesce(s.n_tup_hot_upd,0)::bigint as n_tup_hot_upd, coalesce(s.n_live_tup,0)::bigint as n_live_tup,
      coalesce(s.n_dead_tup,0)::bigint as n_dead_tup, pg_total_relation_size(c.oid)::bigint as size_bytes,
      pg_size_pretty(pg_total_relation_size(c.oid)) as size
    from pg_class c left join pg_stat_user_tables s on s.relid=c.oid
    where c.relnamespace='public'::regnamespace and c.relkind='r'
    order by coalesce(s.n_tup_upd,0) desc, c.relname`);
  const database = await query(`select datname, xact_commit::bigint, xact_rollback::bigint, tup_inserted::bigint, tup_updated::bigint, tup_deleted::bigint, stats_reset from pg_stat_database where datname=current_database()`);
  let wal = [];
  try { wal = await query(`select * from pg_stat_wal`); } catch { /* PostgreSQL version without pg_stat_wal. */ }
  let statements = [];
  let pgStatStatementsAvailable = false;
  try {
    statements = await query(`select queryid, calls::bigint, rows::bigint, total_exec_time, mean_exec_time, shared_blks_hit::bigint, shared_blks_read::bigint, left(regexp_replace(query,'\\s+',' ','g'),500) as query from pg_stat_statements where query ~* '^\\s*update' order by calls desc limit 100`);
    pgStatStatementsAvailable = true;
  } catch { /* Extension is intentionally not enabled just for this audit. */ }
  let service = {};
  try {
    const { stdout } = await execFileAsync("systemctl", ["show", "airradar.service", "-p", "MemoryCurrent", "-p", "CPUUsageNSec"]);
    for (const line of stdout.trim().split("\n")) { const [key, value] = line.split("=", 2); if (key) service[key] = Number(value) || value; }
  } catch { /* Local audit can run without systemd. */ }
  let traffic = { state: "unavailable" };
  try {
    const response = await fetch("http://192.168.1.142:3000/api/health");
    // Persist only a locally derived reachability classification. The raw
    // network response body is intentionally never copied into an artifact.
    traffic = { state: response.ok ? "healthy" : "http_error" };
  } catch { /* The database audit remains useful without the local HTTP listener. */ }
  return { label, capturedAt: new Date().toISOString(), tables, database, wal, statements, pgStatStatementsAvailable, service, traffic };
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const started = await capture("start");
console.error(`DB write audit started; waiting ${Math.round(durationMs / 60_000)} minutes`);
await new Promise((resolve) => setTimeout(resolve, durationMs));
const ended = await capture("end");
const endByName = new Map(ended.tables.map((row) => [row.table_name, row]));
const minutes = (Date.parse(ended.capturedAt) - Date.parse(started.capturedAt)) / 60_000;
const rates = started.tables.map((before) => {
  const after = endByName.get(before.table_name) ?? before;
  const rate = (field) => (Number(after[field]) - Number(before[field])) / minutes;
  const updates = rate("n_tup_upd");
  return { table: before.table_name, updatesPerMin: updates, insertsPerMin: rate("n_tup_ins"), deletesPerMin: rate("n_tup_del"), hotRatio: Number(after.n_tup_upd) - Number(before.n_tup_upd) > 0 ? (Number(after.n_tup_hot_upd) - Number(before.n_tup_hot_upd)) / (Number(after.n_tup_upd) - Number(before.n_tup_upd)) : null, liveRows: Number(after.n_live_tup), deadRows: Number(after.n_dead_tup), size: after.size, sizeBytes: Number(after.size_bytes) };
}).sort((a, b) => b.updatesPerMin - a.updatesPerMin);
const beforeDb = started.database[0] ?? {}; const afterDb = ended.database[0] ?? {};
const delta = (field) => Number(afterDb[field] ?? 0) - Number(beforeDb[field] ?? 0);
const cpuPercentOneCore = started.service.CPUUsageNSec !== undefined && ended.service.CPUUsageNSec !== undefined
  ? (Number(ended.service.CPUUsageNSec) - Number(started.service.CPUUsageNSec)) / (minutes * 60_000_000_000) * 100 : null;
await mkdir(artifact.substring(0, artifact.lastIndexOf("/")), { recursive: true });
await writeFile(artifact, JSON.stringify({
  schemaVersion: 1, generatedAt: new Date().toISOString(), measurement: { startedAt: started.capturedAt, endedAt: ended.capturedAt, durationMinutes: minutes },
  baseline: { transactionsPerMin: (delta("xact_commit") + delta("xact_rollback")) / minutes, updatesPerMin: delta("tup_updated") / minutes, insertsPerMin: delta("tup_inserted") / minutes, deletesPerMin: delta("tup_deleted") / minutes },
  perTable: rates, queryAttribution: ended.statements, pgStatStatementsAvailable: ended.pgStatStatementsAvailable,
  wal: { before: started.wal, after: ended.wal, delta: (ended.wal.length && started.wal.length) ? Object.fromEntries(Object.keys(ended.wal[0]).filter((key) => typeof ended.wal[0][key] === "string" && /^\d+$/.test(ended.wal[0][key]) && key in started.wal[0]).map((key) => [key, Number(ended.wal[0][key]) - Number(started.wal[0][key])])) : null },
  service: { before: started.service, after: ended.service, cpuPercentOneCore },
  traffic: { before: started.traffic, after: ended.traffic },
  classification: { immediate: ["flight", "flightPosition", "flightEvent"], coalescible: ["flight"], skipIfUnchanged: ["aircraft"], periodicAggregate: ["receiverDailyStats", "receiverDailyAircraft", "receiverDailyCoverage", "receiverDailyCoverageAltitude", "receiverCoverageHourly"], leaveAsIs: ["navigationIntegrityObservation", "navigationIntegrityAnomaly", "aircraftWeatherObservation"] },
  snapshots: { started, ended },
}, null, 2));
console.log(JSON.stringify({ artifact, durationMinutes: minutes, topUpdates: rates.slice(0, 12), pgStatStatementsAvailable: ended.pgStatStatementsAvailable }, null, 2));
await pool.end();
