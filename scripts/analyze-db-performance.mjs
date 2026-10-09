#!/usr/bin/env node
// Read-only offline analysis of sanitized DB metrics. Never connects to production.
import { readFile, writeFile } from "node:fs/promises";
const [source, destination] = process.argv.slice(2);
if (!source) { console.error("Usage: node scripts/analyze-db-performance.mjs database-metrics.json [report.json]"); process.exit(2); }
const data = JSON.parse(await readFile(source, "utf8"));
function finite(value, key) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid metric: " + key);
  return value;
}
const commits = finite(data.transactions?.commitsDelta, "commitsDelta");
const rollbacks = finite(data.transactions?.rollbacksDelta, "rollbacksDelta");
const total = commits + rollbacks;
const minutes = finite(data.window?.durationMinutes, "durationMinutes");
if (total === 0 || minutes === 0) throw new Error("Empty observation window");
const tables = (data.tables ?? []).map(row => {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(row.table)) throw new Error("Invalid table name");
  const live = finite(row.liveRowsEnd, row.table + ".liveRowsEnd");
  const dead = finite(row.deadRowsEnd, row.table + ".deadRowsEnd");
  return { table: row.table, deadTupleRatio: Number((dead / Math.max(live + dead, 1)).toFixed(4)),
    updatesPerMin: finite(row.updatesPerMin ?? 0, row.table + ".updatesPerMin"),
    insertsPerMin: finite(row.insertsPerMin ?? 0, row.table + ".insertsPerMin") };
}).sort((a,b) => b.updatesPerMin-a.updatesPerMin);
const report = {
  schemaVersion: 1, status: "diagnostic-only", observationMinutes: minutes,
  rollbackRatio: Number((rollbacks / total).toFixed(4)),
  rollbackPerMinute: Number((rollbacks / minutes).toFixed(2)),
  notes: [
    "PostgreSQL xact_rollback counts aborted transactions; it does not identify application errors.",
    "Table update rates are cumulative statistics deltas, not proof of redundant writes.",
    "Obtain approved per-operation attribution before changing persistence, transactions or autovacuum.",
  ],
  highUpdateTables: tables.slice(0,10),
};
const output = JSON.stringify(report,null,2)+"\n";
if (destination) await writeFile(destination, output, {flag:"wx"});
else process.stdout.write(output);
