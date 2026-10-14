#!/usr/bin/env node

/**
 * External ATC canary guard.  It is intentionally a systemd timer process,
 * not part of the AirRadar Node.js runtime.  It only changes the two ATC
 * switches, and only after acquiring both production locks.
 */
import { copyFile, chmod, chown, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const APP = "/var/www/airradar";
const ENV = `${APP}/.env`;
const STATE_DIR = process.env.ATC_WATCHDOG_STATE_DIR?.trim() || "/var/lib/airradar-atc-watchdog";
const BACKUP = `${STATE_DIR}/verified.env`;
const STATE = `${STATE_DIR}/state.json`;
const RELEASE_LOCK = "/var/lock/airradar-release.lock";
const BUILD_LOCK = "/var/lib/airradar/build.lock";
const BASE = process.env.ATC_WATCHDOG_BASE_URL?.trim() || "http://192.168.1.142:3000";
const COOLDOWN_MS = 30 * 60_000;
const MAX_RECOVERIES = 1;
const WINDOW_MS = 3 * 60_000;

function die(message) { throw new Error(message); }
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
function parseFlags(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(AIRRADAR_ATC_(?:RESOLUTION|SHADOW_PREDICTION)_ENABLED)=(true|false)\s*$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  if (!values.AIRRADAR_ATC_RESOLUTION_ENABLED || !values.AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED) die("atc_flags_missing");
  return values;
}
function withFlags(text, resolution, shadow) {
  const replacements = new Map([
    ["AIRRADAR_ATC_RESOLUTION_ENABLED", resolution ? "true" : "false"],
    ["AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED", shadow ? "true" : "false"],
  ]);
  const seen = new Set();
  const lines = text.split(/\r?\n/).map((line) => {
    const name = line.match(/^(AIRRADAR_ATC_(?:RESOLUTION|SHADOW_PREDICTION)_ENABLED)=/)?.[1];
    if (!name) return line;
    seen.add(name);
    return `${name}=${replacements.get(name)}`;
  });
  if (seen.size !== 2) die("atc_flags_missing");
  return lines.join("\n");
}
async function atomicWrite(path, text, sourceStat) {
  const temp = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temp, text, { encoding: "utf8", mode: sourceStat?.mode & 0o777 || 0o600, flag: "wx" });
    if (sourceStat) await chown(temp, sourceStat.uid, sourceStat.gid);
    await chmod(temp, sourceStat?.mode & 0o777 || 0o600);
    await rename(temp, path);
  } catch (error) {
    try { await exec("/usr/bin/rm", ["-f", temp]); } catch {}
    throw error;
  }
}
async function readState() {
  try { return JSON.parse(await readFile(STATE, "utf8")); } catch { return {}; }
}
async function saveState(value) { await atomicWrite(STATE, JSON.stringify(value) + "\n", { mode: 0o600, uid: 0, gid: 0 }); }
async function lock(path) {
  const child = spawn("/usr/bin/flock", ["-n", path, "-c", "printf acquired; exec sleep 3600"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const acquired = await new Promise((resolve, reject) => {
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; if (output.includes("acquired")) resolve(true); });
    child.once("error", reject);
    child.once("exit", () => { if (!output.includes("acquired")) resolve(false); });
  });
  let closed = false;
  const stop = () => { if (closed) return; closed = true; try { process.kill(-child.pid, "SIGTERM"); } catch {} };
  if (!acquired) { stop(); die("production_lock_busy"); }
  return { close: async () => { if (closed) return; stop(); await new Promise((resolve) => child.once("exit", resolve)); } };
}
async function acquireLocks() {
  const release = await lock(RELEASE_LOCK);
  try { return { release, build: await lock(BUILD_LOCK) }; }
  catch (error) { await release.close(); throw error; }
}
export function validateActivationPreconditions({ phase, state, currentFlags, verifiedFlags, timerActive }) {
  if (phase !== "assignment" && phase !== "shadow") die("invalid_phase");
  if (!state || state.mode !== "armed") die("watchdog_not_armed");
  if (!Number.isSafeInteger(state.recoveries) || state.recoveries >= MAX_RECOVERIES) die("recovery_budget_exhausted");
  if (!verifiedFlags || verifiedFlags.AIRRADAR_ATC_RESOLUTION_ENABLED !== "false" ||
      verifiedFlags.AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED !== "false") die("verified_backup_not_off");
  const expected = phase === "assignment" ? ["false", "false"] : ["true", "false"];
  if (!currentFlags || currentFlags.AIRRADAR_ATC_RESOLUTION_ENABLED !== expected[0] ||
      currentFlags.AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED !== expected[1]) {
    die("unexpected_previous_atc_config");
  }
  if (timerActive !== true) die("watchdog_timer_inactive");
}
async function json(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${BASE}${path}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) die(`http_${path}_${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const body = await json("/api/health");
      if (body.status === "ok") return body;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw lastError ?? new Error("health_timeout");
}
async function metricSnapshot() {
  const [health, version, status, performance] = await Promise.all([
    json("/api/health"), json("/api/version"), json("/api/system/status"), json("/api/system/runtime-performance"),
  ]);
  const runtime = performance.runtime ?? {};
  const loop = finite(runtime.eventLoopLagP99Ms) ? runtime.eventLoopLagP99Ms : performance.phases?.["health.event-loop"]?.p99Ms;
  const rss = runtime.rssBytes ?? status.runtime?.processRssBytes;
  const cpu = runtime.cpuIntervalPercent;
  const memoryMax = status.runtime?.cgroupMemoryMaxBytes;
  const memoryCurrent = status.runtime?.cgroupMemoryCurrentBytes;
  if (health.status !== "ok" || version.channel !== "production" || status.application?.status !== "ok" || status.database?.status === "error") die("core_health_failed");
  return { at: Date.now(), pid: status.application?.pid ?? status.runtime?.transactionAttribution?.processId ?? null,
    commit: version.commit, health: health.status, cpu, loopP99: loop, rss, memoryMax, memoryCurrent,
    atc: status.atc, runtimeStatus: status.operationalHealth?.state };
}
function bad(snapshot, prior) {
  if (!finite(snapshot.loopP99) || snapshot.loopP99 > 1000) return "event_loop_critical";
  if (finite(snapshot.cpu) && snapshot.cpu > 90 && prior.filter((x) => x.at >= snapshot.at - WINDOW_MS).length >= 2 && prior.slice(-2).every((x) => x.cpu > 90)) return "cpu_sustained";
  if (finite(snapshot.loopP99) && snapshot.loopP99 > 500 && prior.length >= 1 && prior.slice(-1).every((x) => x.loopP99 > 500)) return "event_loop_sustained";
  if (finite(snapshot.memoryMax) && snapshot.memoryMax > 0 && finite(snapshot.memoryCurrent) && snapshot.memoryCurrent / snapshot.memoryMax > 0.85) return "cgroup_memory_high";
  return null;
}
async function restore(reason, heldLocks = null) {
  const locks = heldLocks ?? await acquireLocks();
  try {
    const state = await readState();
    if (state.recoveries >= MAX_RECOVERIES) die("recovery_budget_exhausted");
    if (state.lastRecoveryAt && Date.now() - state.lastRecoveryAt < COOLDOWN_MS) die("recovery_cooldown");
    const current = await readFile(ENV, "utf8");
    const currentFlags = parseFlags(current);
    if (currentFlags.AIRRADAR_ATC_RESOLUTION_ENABLED === "false" && currentFlags.AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED === "false") return "already_off";
    const verified = await readFile(BACKUP, "utf8");
    const verifiedFlags = parseFlags(verified);
    if (verifiedFlags.AIRRADAR_ATC_RESOLUTION_ENABLED !== "false" || verifiedFlags.AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED !== "false") die("verified_backup_not_off");
    const envStat = await stat(ENV);
    await atomicWrite(ENV, withFlags(current, false, false), envStat);
    await locks.build.close();
    await exec("/usr/bin/systemctl", ["restart", "airradar.service"]);
    await waitForHealth();
    await saveState({ ...state, mode: "lockout", recoveries: (state.recoveries || 0) + 1, lastRecoveryAt: Date.now(), reason, restored: true });
    return "restored_off";
  } finally { if (!heldLocks) { await locks.build.close(); await locks.release.close(); } }
}
async function initialize() {
  await mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  const current = await readFile(ENV, "utf8");
  const flags = parseFlags(current);
  if (flags.AIRRADAR_ATC_RESOLUTION_ENABLED !== "false" || flags.AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED !== "false") die("initialize_requires_atc_off");
  await copyFile(ENV, BACKUP, 0);
  await chmod(BACKUP, 0o600);
  await saveState({ schema: 1, mode: "armed", recoveries: 0, preparedAt: Date.now(), baseline: flags, samples: [] });
  process.stdout.write("ATC watchdog armed with verified false/false backup\n");
}
async function activate(phase) {
  const locks = await acquireLocks();
  let changed = false;
  try {
    // All activation inputs are read only after both locks are held. This
    // prevents a concurrent watchdog recovery/import/release from invalidating
    // the decision between validation and the .env replacement.
    const state = await readState();
    const current = await readFile(ENV, "utf8");
    const verified = await readFile(BACKUP, "utf8");
    const timerActive = await exec("/usr/bin/systemctl", ["is-active", "--quiet", "airradar-atc-watchdog.timer"])
      .then(() => true, () => false);
    validateActivationPreconditions({ phase, state, currentFlags: parseFlags(current), verifiedFlags: parseFlags(verified), timerActive });
    const envStat = await stat(ENV);
    const next = withFlags(current, true, phase === "shadow");
    await atomicWrite(ENV, next, envStat);
    await locks.build.close();
    changed = true;
    await exec("/usr/bin/systemctl", ["restart", "airradar.service"]);
    await waitForHealth();
    process.stdout.write(`ATC ${phase} configuration active; health OK\n`);
  } catch (error) {
    if (changed) {
      try {
        const envStat = await stat(ENV);
        await atomicWrite(ENV, current, envStat);
        await exec("/usr/bin/systemctl", ["restart", "airradar.service"]);
      } catch {}
    }
    throw error;
  } finally { await locks.build.close(); await locks.release.close(); }
}
async function once() {
  const locks = await acquireLocks();
  try {
    const state = await readState();
    if (state.mode !== "armed") return { action: "inactive" };
    const current = parseFlags(await readFile(ENV, "utf8"));
    if (current.AIRRADAR_ATC_RESOLUTION_ENABLED === "false" && current.AIRRADAR_ATC_SHADOW_PREDICTION_ENABLED === "false") return { action: "off" };
    const sample = await metricSnapshot();
    const samples = [...(state.samples || []), sample].filter((x) => x.at >= sample.at - WINDOW_MS);
    const reason = bad(sample, samples.slice(0, -1));
    await saveState({ ...state, samples });
    if (reason) return { action: await restore(reason, locks), reason };
    return { action: "healthy", pid: sample.pid, commit: sample.commit };
  } finally { await locks.build.close(); await locks.release.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2] || "--once";
  try {
    if (command === "--initialize") await initialize();
    else if (command === "--activate" && process.argv.length === 4) await activate(process.argv[3]);
    else if (command === "--restore" && process.argv.length === 4) process.stdout.write(`${await restore(process.argv[3])}\n`);
    else if (command === "--once") process.stdout.write(JSON.stringify(await once()) + "\n");
    else if (command === "--dry-run") process.stdout.write(JSON.stringify({ stateDir: STATE_DIR, env: ENV, releaseLock: RELEASE_LOCK, buildLock: BUILD_LOCK, restart: "airradar.service only" }) + "\n");
    else die("invalid_command");
  } catch (error) {
    process.stderr.write(`ATC watchdog unavailable: ${error instanceof Error ? error.message : "unknown"}\n`);
    process.exitCode = 1;
  }
}
