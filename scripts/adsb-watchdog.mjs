#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const STATUS_URL = process.env.AIRRADAR_ADSB_WATCHDOG_STATUS_URL?.trim()
  || "http://192.168.1.142:3000/api/system/status";
const STATE_FILE = process.env.AIRRADAR_ADSB_WATCHDOG_STATE_FILE?.trim()
  || "/run/airradar-adsb-watchdog/last-restart";
const REQUEST_TIMEOUT_MS = 10_000;
const STALE_THRESHOLD_MS = 3 * 60_000;
const RESTART_COOLDOWN_MS = 15 * 60_000;

function timestampMs(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readLastRestartAt() {
  try {
    const value = Number(readFileSync(STATE_FILE, "utf8").trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function shouldRestart(adsbLol, now = Date.now()) {
  if (!adsbLol || adsbLol.enabled !== true || adsbLol.status === "ok") return false;

  const lastSuccessAt = timestampMs(adsbLol.lastSuccessAt);
  const lastAttemptAt = timestampMs(adsbLol.lastAttemptAt);
  const successAge = lastSuccessAt === null ? Number.POSITIVE_INFINITY : now - lastSuccessAt;
  const attemptAge = lastAttemptAt === null ? Number.POSITIVE_INFINITY : now - lastAttemptAt;

  // A provider that is returning errors keeps making attempts and is allowed
  // to use its own backoff. Restart only when both the last success and the
  // last attempt have gone stale, which catches a permanently pending poll.
  return successAge >= STALE_THRESHOLD_MS && attemptAge >= STALE_THRESHOLD_MS;
}

function restartIsCoolingDown(now = Date.now()) {
  const lastRestartAt = readLastRestartAt();
  return lastRestartAt !== null && now - lastRestartAt < RESTART_COOLDOWN_MS;
}

async function readStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(STATUS_URL, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`status HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function runWatchdog({ now = Date.now(), restart = () => {
  execFileSync("/usr/bin/systemctl", ["restart", "airradar.service"], { stdio: "inherit" });
} } = {}) {
  let body;
  try {
    body = await readStatus();
  } catch (error) {
    console.warn(`[adsb-watchdog] status check failed: ${error instanceof Error ? error.message : String(error)}`);
    return { action: "unavailable" };
  }

  const adsbLol = body && typeof body === "object" && !Array.isArray(body) ? body.adsbLol : null;
  if (!shouldRestart(adsbLol, now)) return { action: "none" };

  if (restartIsCoolingDown(now)) {
    console.warn("[adsb-watchdog] ADSB.lol stale; restart cooldown active");
    return { action: "cooldown" };
  }

  writeFileSync(STATE_FILE, `${now}\n`, { encoding: "utf8", mode: 0o600 });
  console.warn("[adsb-watchdog] ADSB.lol stale; restarting airradar.service");
  restart();
  return { action: "restart" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWatchdog().catch((error) => {
    console.error(`[adsb-watchdog] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
