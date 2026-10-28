#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

function percentile(values, p) { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : null; }
function summary(values) { const valid = values.filter(Number.isFinite); return { count: valid.length, p50: percentile(valid, .5), p95: percentile(valid, .95), max: valid.length ? Math.max(...valid) : null }; }
export function summarize(samples, { hours = 24 } = {}) {
  const windowHours = Math.min(168, Math.max(1, Number(hours) || 24));
  const valid = samples.filter((x) => x?.schemaVersion === 1 && typeof x.recordedAt === "string")
    .filter((x) => Date.parse(x.recordedAt) >= Date.now() - windowHours * 3_600_000);
  const first = valid[0];
  const last = valid.at(-1);
  const delta = (field) => {
    const before = Number(first?.database?.database?.[field]);
    const after = Number(last?.database?.database?.[field]);
    return Number.isFinite(before) && Number.isFinite(after) && after >= before ? after - before : null;
  };
  return {
    schemaVersion: 1, windowHours, sampleCount: valid.length,
    firstRecordedAt: valid[0]?.recordedAt ?? null, lastRecordedAt: valid.at(-1)?.recordedAt ?? null,
    availabilityPercent: valid.length > 0 ? Number((valid.length / Math.max(1, windowHours * 60) * 100).toFixed(2)) : 0,
    runtime: {
      cpuPercent: summary(valid.map((x) => x.runtime?.cpuIntervalPercent)),
      rssBytes: summary(valid.map((x) => x.runtime?.rssBytes)),
      eventLoopP99Ms: summary(valid.map((x) => x.runtime?.eventLoopP99Ms)),
    },
    database: {
      walSamples: valid.filter((x) => x.database?.wal).length,
      transactionSamples: valid.filter((x) => x.database?.database).length,
      lockWaitSamples: valid.filter((x) => x.database?.activity).length,
      transactionDelta: { commits: delta("xact_commit"), rollbacks: delta("xact_rollback") },
      maxLockWaiting: valid.reduce((max, x) => Math.max(max, Number(x.database?.activity?.lock_waiting) || 0), 0),
    },
    hostCpu: { availableSamples: valid.filter((x) => x.hostCpu?.status === "available").length, unavailableSamples: valid.filter((x) => x.hostCpu?.status !== "available").length },
  };
}
export async function readSamples(directory) {
  const names = (await readdir(directory)).filter((name) => /^sample-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();
  const rows = [];
  for (const name of names) for (const line of (await readFile(join(directory, name), "utf8")).split("\n")) if (line.trim()) { try { rows.push(JSON.parse(line)); } catch { /* ignore a truncated final line */ } }
  return rows.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const directory = process.env.AIRRADAR_MONITOR_OUTPUT_DIR ?? "/var/lib/airradar/monitoring";
  const hours = Number(process.env.AIRRADAR_MONITOR_REPORT_HOURS ?? 24);
  readSamples(directory).then((samples) => console.log(JSON.stringify(summarize(samples, { hours }), null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
