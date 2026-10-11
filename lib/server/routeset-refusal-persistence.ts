import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

// An HTTP 401/403 from the upstream service is an explicit refusal. The
// existing in-process cooldown protects ordinary traffic, but a fresh Next.js
// worker or deployment must not immediately retry the same refused endpoint.
const MAX_COOLDOWN_MS = 6 * 60 * 60_000;
const MAX_STATE_BYTES = 512;
const DEFAULT_STATE_FILE = "/var/lib/airradar/routeset-refusal-v1.json";

function stateFile(): string | null {
  const configured = process.env.AIRRADAR_ROUTESET_REFUSAL_STATE_FILE?.trim();
  if (configured === "off") return null;
  if (configured) return configured.startsWith("/") ? configured : null;
  return process.env.NODE_ENV === "production" ? DEFAULT_STATE_FILE : null;
}

/** Ignore corrupt, stale, implausibly future or inaccessible state, fail-open. */
export function readRoutesetRefusalCooldown(now = Date.now()): string | null {
  const file = stateFile();
  if (!file) return null;
  try {
    if (statSync(file).size > MAX_STATE_BYTES) return null;
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!value || typeof value !== "object"
      || (value as { version?: unknown }).version !== 1) return null;
    const raw = (value as { blockedUntilAt?: unknown }).blockedUntilAt;
    if (typeof raw !== "string" || !/^\\d{4}-\\d{2}-\\d{2}T/.test(raw)) return null;
    const until = Date.parse(raw);
    return Number.isFinite(until) && until > now && until <= now + MAX_COOLDOWN_MS
      ? new Date(until).toISOString() : null;
  } catch { return null; }
}

/** Best-effort atomic and private 403 cooldown state; no callsigns or tokens. */
export function saveRoutesetRefusalCooldown(blockedUntilAt: string): boolean {
  const file = stateFile();
  if (!file) return false;
  const until = Date.parse(blockedUntilAt);
  if (!Number.isFinite(until) || until <= Date.now() || until > Date.now() + MAX_COOLDOWN_MS + 1_000) return false;
  let temp: string | null = null;
  try {
    mkdirSync(dirname(file), { recursive: true });
    temp = file + ".tmp-" + process.pid + "-" + randomBytes(6).toString("hex");
    writeFileSync(temp, JSON.stringify({ version: 1, blockedUntilAt: new Date(until).toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temp, file);
    return true;
  } catch {
    if (temp) { try { rmSync(temp, { force: true }); } catch { /* best effort */ } }
    return false;
  }
}

/** A successful provider response clears any previous refusal across restarts. */
export function clearRoutesetRefusalCooldown(): void {
  const file = stateFile();
  if (!file) return;
  try { rmSync(file, { force: true }); } catch { /* best effort */ }
}
