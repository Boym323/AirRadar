import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { matchesAircraftRule } from "@/lib/aircraft/watchlist";
import type { Aircraft, AircraftView, StateSnapshot } from "@/lib/aircraft/types";
import {
  getAlertConfigPath,
  loadAlertConfig,
  type AlertRule,
} from "@/lib/server/alert-config";
import { getAlertCooldownMs, isEmergencyAlertEnabled } from "@/lib/server/config";
import { normalizeIcaoHex } from "@/lib/server/validation";

export interface WatchlistRuleInput {
  id?: unknown;
  name?: unknown;
  enabled?: unknown;
  type?: unknown;
  value?: unknown;
  maxDistanceKm?: unknown;
  /** The engine has one server-wide cooldown; this is accepted only as a safe validation echo. */
  cooldownMs?: unknown;
}

export interface WatchlistCurrentAircraft {
  icaoHex: string;
  registration: string | null;
  callsign: string | null;
  lastSeenAt: string;
}

export interface WatchlistCurrentState {
  status: "matching" | "notMatching" | "unknown";
  aircraft: WatchlistCurrentAircraft[];
  observedAt: string | null;
}

export interface PublicWatchlistRule {
  id: string;
  name: string;
  enabled: boolean;
  type: AlertRule["type"];
  value: string;
  maxDistanceKm?: number;
  cooldownMs: number;
  lastTriggeredAt: string | null;
  currentState: WatchlistCurrentState;
}

export interface PublicWatchlistResponse {
  rules: PublicWatchlistRule[];
  cooldownMs: number;
  emergency: { enabled: boolean };
}

export class WatchlistValidationError extends Error {
  constructor(readonly code: "invalid_rule" | "invalid_icao" | "invalid_distance" | "invalid_cooldown" | "duplicate_rule") {
    super(code);
    this.name = "WatchlistValidationError";
  }
}

export class WatchlistNotFoundError extends Error {
  constructor() {
    super("watchlist rule not found");
    this.name = "WatchlistNotFoundError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function provided(input: WatchlistRuleInput, key: keyof WatchlistRuleInput): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function safeRuleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 120 || id.includes("/") || id.includes("\\") || id === "." || id === "..") return null;
  return id;
}

function generatedRuleId(name: string, existing: AlertRule[]): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "watchlist";
  const existingIds = new Set(existing.map((rule) => rule.id));
  let id = `${slug}-${randomUUID().slice(0, 8)}`;
  while (existingIds.has(id)) id = `${slug}-${randomUUID().slice(0, 8)}`;
  return id;
}

function normalizeValue(type: AlertRule["type"], rawValue: unknown): string {
  if (typeof rawValue !== "string" || !rawValue.trim()) throw new WatchlistValidationError("invalid_rule");
  const value = rawValue.trim();
  if (type === "icaoHex") {
    const normalized = normalizeIcaoHex(value);
    if (!normalized) throw new WatchlistValidationError("invalid_icao");
    return normalized;
  }
  return value.toUpperCase();
}

function normalizeType(rawType: unknown, fallback?: AlertRule["type"]): AlertRule["type"] {
  if (rawType === undefined && fallback) return fallback;
  if (typeof rawType !== "string") throw new WatchlistValidationError("invalid_rule");
  const aliases: Record<string, AlertRule["type"]> = {
    icao: "icaoHex",
    icaoHex: "icaoHex",
    registration: "registration",
    callsign: "callsign",
    pattern: "callsignPattern",
    callsignPattern: "callsignPattern",
    type: "aircraftType",
    aircraftType: "aircraftType",
    airline: "airline",
  };
  const type = aliases[rawType];
  if (!type) throw new WatchlistValidationError("invalid_rule");
  return type;
}

function normalizeDistance(rawDistance: unknown, fallback: number | undefined): number | undefined {
  if (rawDistance === undefined) return fallback;
  if (rawDistance === null || rawDistance === "") return undefined;
  if (typeof rawDistance !== "number" || !Number.isFinite(rawDistance) || rawDistance <= 0) {
    throw new WatchlistValidationError("invalid_distance");
  }
  return rawDistance;
}

function validateCooldown(rawCooldown: unknown): void {
  if (rawCooldown === undefined) return;
  if (typeof rawCooldown !== "number" || !Number.isFinite(rawCooldown) || rawCooldown < getAlertCooldownMs()) {
    throw new WatchlistValidationError("invalid_cooldown");
  }
}

export function normalizeWatchlistRule(
  input: WatchlistRuleInput,
  existing: AlertRule | undefined,
  allRules: AlertRule[],
): AlertRule {
  const type = normalizeType(input.type, existing?.type);
  const value = normalizeValue(type, provided(input, "value") ? input.value : existing?.value);
  const rawName = provided(input, "name") ? input.name : existing?.name ?? existing?.id ?? `${type}:${value}`;
  if (typeof rawName !== "string" || !rawName.trim() || rawName.trim().length > 120) {
    throw new WatchlistValidationError("invalid_rule");
  }
  const name = rawName.trim();
  const rawId = provided(input, "id") ? input.id : existing?.id;
  const id = existing?.id ?? (rawId === undefined ? generatedRuleId(name, allRules) : safeRuleId(rawId));
  if (!id) throw new WatchlistValidationError("invalid_rule");
  if (!existing && allRules.some((rule) => rule.id === id)) throw new WatchlistValidationError("duplicate_rule");

  const enabled = provided(input, "enabled") ? input.enabled : existing?.enabled ?? true;
  if (typeof enabled !== "boolean") throw new WatchlistValidationError("invalid_rule");
  validateCooldown(input.cooldownMs);
  const maxDistanceKm = normalizeDistance(input.maxDistanceKm, existing?.maxDistanceKm);

  return {
    id,
    name,
    enabled,
    type,
    value,
    ...(maxDistanceKm === undefined ? {} : { maxDistanceKm }),
  };
}

function persistedRule(rule: AlertRule): Record<string, unknown> {
  return {
    id: rule.id,
    name: rule.name ?? rule.id,
    enabled: rule.enabled,
    type: rule.type,
    value: rule.value,
    ...(rule.maxDistanceKm === undefined ? {} : { maxDistanceKm: rule.maxDistanceKm }),
  };
}

const writeQueues = new Map<string, Promise<void>>();

async function writeAlertConfigAtomically(targetPath: string, rules: AlertRule[]): Promise<void> {
  const directory = dirname(targetPath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(directory, `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);
  const payload = `${JSON.stringify(rules.map(persistedRule), null, 2)}\n`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(payload, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, targetPath);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function withWriteLock<T>(targetPath: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(targetPath) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const settled = result.then(() => undefined, () => undefined);
  writeQueues.set(targetPath, settled);
  void settled.then(() => {
    if (writeQueues.get(targetPath) === settled) writeQueues.delete(targetPath);
  });
  return result;
}

function currentRules(path: string): AlertRule[] {
  return loadAlertConfig(path).rules;
}

export async function listWatchlistRules(path = getAlertConfigPath()): Promise<AlertRule[]> {
  return currentRules(path);
}

export async function createWatchlistRule(input: WatchlistRuleInput, path = getAlertConfigPath()): Promise<AlertRule> {
  return withWriteLock(path, async () => {
    const rules = currentRules(path);
    const rule = normalizeWatchlistRule(input, undefined, rules);
    await writeAlertConfigAtomically(path, [...rules, rule]);
    return rule;
  });
}

export async function updateWatchlistRule(id: string, input: WatchlistRuleInput, path = getAlertConfigPath()): Promise<AlertRule> {
  return withWriteLock(path, async () => {
    const rules = currentRules(path);
    const index = rules.findIndex((rule) => rule.id === id);
    if (index < 0) throw new WatchlistNotFoundError();
    if (provided(input, "id") && input.id !== id) throw new WatchlistValidationError("invalid_rule");
    const rule = normalizeWatchlistRule(input, rules[index], rules);
    const next = rules.slice();
    next[index] = rule;
    await writeAlertConfigAtomically(path, next);
    return rule;
  });
}

export async function deleteWatchlistRule(id: string, path = getAlertConfigPath()): Promise<void> {
  return withWriteLock(path, async () => {
    const rules = currentRules(path);
    const next = rules.filter((rule) => rule.id !== id);
    if (next.length === rules.length) throw new WatchlistNotFoundError();
    await writeAlertConfigAtomically(path, next);
  });
}

function publicAircraft(aircraft: Aircraft | AircraftView): WatchlistCurrentAircraft {
  return {
    icaoHex: aircraft.icaoHex,
    registration: aircraft.registration ?? aircraft.enrichment?.metadata?.registration ?? null,
    callsign: aircraft.callsign,
    lastSeenAt: aircraft.lastSeen,
  };
}

function currentState(rule: AlertRule, snapshot: StateSnapshot): WatchlistCurrentState {
  if (snapshot.lastSourceUpdate === null) return { status: "unknown", aircraft: [], observedAt: null };
  const aircraft = snapshot.aircraft.filter((item) => matchesAircraftRule(item, rule)).slice(0, 20);
  return {
    status: aircraft.length ? "matching" : "notMatching",
    aircraft: aircraft.map(publicAircraft),
    observedAt: snapshot.lastSourceUpdate,
  };
}

export function toPublicWatchlistResponse(
  rules: AlertRule[],
  snapshot: StateSnapshot,
  lastTriggeredByRule: ReadonlyMap<string, string> = new Map(),
): PublicWatchlistResponse {
  const cooldownMs = getAlertCooldownMs();
  return {
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name ?? rule.id,
      enabled: rule.enabled,
      type: rule.type,
      value: rule.value,
      ...(rule.maxDistanceKm === undefined ? {} : { maxDistanceKm: rule.maxDistanceKm }),
      cooldownMs,
      lastTriggeredAt: lastTriggeredByRule.get(rule.id) ?? null,
      currentState: currentState(rule, snapshot),
    })),
    cooldownMs,
    emergency: { enabled: isEmergencyAlertEnabled() },
  };
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
