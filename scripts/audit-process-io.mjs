#!/usr/bin/env node
// Read-only Linux process I/O sampler. Does not trace filenames or change runtime settings.
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

function parseCounters(source) {
  const entries = Object.fromEntries(source.split("\n").map(line => {
    const match = /^([a-z_]+):\s*(\d+)$/.exec(line.trim());
    return match ? [match[1], Number(match[2])] : null;
  }).filter(Boolean));
  for (const name of ["rchar", "wchar", "read_bytes", "write_bytes", "cancelled_write_bytes"]) {
    if (!Number.isSafeInteger(entries[name])) throw new Error("Missing or unsafe /proc IO counter: " + name);
  }
  return entries;
}

const pid = Number(process.env.AIRRADAR_AUDIT_PID ?? "");
const durationMs = Number(process.env.AIRRADAR_AUDIT_DURATION_MS ?? 60_000);
const output = process.env.AIRRADAR_AUDIT_OUTPUT;
if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Set AIRRADAR_AUDIT_PID to the AirRadar Node PID");
if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 3600_000) throw new Error("Duration must be 1000..3600000 ms");
const ioPath = `/proc/${pid}/io`;
const statPath = `/proc/${pid}/stat`;
async function snapshot() {
  const [io, stat] = await Promise.all([readFile(ioPath, "utf8"), readFile(statPath, "utf8")]);
  // The kernel PID starttime (field 22) disambiguates PID reuse. comm may contain spaces.
  const end = stat.lastIndexOf(")");
  if (end < 0) throw new Error("Malformed /proc stat");
  const fields = stat.slice(end + 2).trim().split(/\s+/);
  const startTicks = fields[19];
  if (!/^\d+$/.test(startTicks ?? "")) throw new Error("Missing process starttime");
  return { io: parseCounters(io), startTicks };
}
const started = await snapshot();
const startMs = performance.now();
await new Promise(resolve => setTimeout(resolve, durationMs));
const ended = await snapshot();
if (started.startTicks !== ended.startTicks) throw new Error("Process restarted; sample invalid");
const minutes = (performance.now() - startMs) / 60000;
const perMinute = Object.fromEntries(Object.keys(started.io).map(key => {
  const delta = ended.io[key] - started.io[key];
  if (delta < 0) throw new Error("Counter rolled back: " + key);
  return [key, { bytes: delta, mibPerMin: Number((delta / 1048576 / minutes).toFixed(3)) }];
}));
const report = { schemaVersion: 1, pid, durationMinutes: minutes, processIdentity: started.startTicks, note: "Process-level logical I/O, NOT physical device writes or file attribution", perMinute };
if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
