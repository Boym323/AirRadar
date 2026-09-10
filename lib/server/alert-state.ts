import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { getRuntimeStateDirectory } from "@/lib/server/runtime-state";

const STATE_VERSION = 1;
const MAX_STATE_ENTRIES = 10_000;
const MAX_KEY_LENGTH = 240;

export interface AlertEnginePersistentState {
  dedup: Array<[string, number]>;
  permanent: Array<[string, number]>;
  ruleLastTriggered: Array<[string, number]>;
}

export interface AlertStateStore {
  load(): AlertEnginePersistentState;
  save(state: AlertEnginePersistentState): void;
}

interface StoredState extends AlertEnginePersistentState {
  version: typeof STATE_VERSION;
  updatedAt: string;
}

function emptyState(): AlertEnginePersistentState {
  return { dedup: [], permanent: [], ruleLastTriggered: [] };
}

function sanitizeEntries(value: unknown): Array<[string, number]> {
  if (!Array.isArray(value)) return [];
  const entries: Array<[string, number]> = [];
  for (const item of value.slice(-MAX_STATE_ENTRIES)) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [key, timestamp] = item;
    if (typeof key !== "string" || !key || key.length > MAX_KEY_LENGTH) continue;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0) continue;
    entries.push([key, timestamp]);
  }
  return entries;
}

function normalizeState(value: unknown): AlertEnginePersistentState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyState();
  const record = value as Record<string, unknown>;
  if (record.version !== STATE_VERSION) return emptyState();
  return {
    dedup: sanitizeEntries(record.dedup),
    permanent: sanitizeEntries(record.permanent),
    ruleLastTriggered: sanitizeEntries(record.ruleLastTriggered),
  };
}

export function getAlertStatePath(): string {
  return join(getRuntimeStateDirectory(), "alert-engine-state.json");
}

export class JsonAlertStateStore implements AlertStateStore {
  constructor(private readonly path = getAlertStatePath()) {}

  load(): AlertEnginePersistentState {
    if (!existsSync(this.path)) return emptyState();
    try {
      return normalizeState(JSON.parse(readFileSync(this.path, "utf8")) as unknown);
    } catch {
      return emptyState();
    }
  }

  save(state: AlertEnginePersistentState): void {
    const directory = dirname(this.path);
    mkdirSync(directory, { recursive: true });
    const temporaryPath = join(directory, `.${basename(this.path)}.${process.pid}.${randomUUID()}.tmp`);
    const payload: StoredState = {
      version: STATE_VERSION,
      updatedAt: new Date().toISOString(),
      dedup: sanitizeEntries(state.dedup),
      permanent: sanitizeEntries(state.permanent),
      ruleLastTriggered: sanitizeEntries(state.ruleLastTriggered),
    };
    let fd: number | null = null;
    try {
      fd = openSync(temporaryPath, "wx", 0o600);
      writeFileSync(fd, `${JSON.stringify(payload)}\n`, "utf8");
      fsyncSync(fd);
      closeSync(fd);
      fd = null;
      renameSync(temporaryPath, this.path);
    } finally {
      if (fd !== null) closeSync(fd);
      try { unlinkSync(temporaryPath); } catch { /* already renamed or absent */ }
    }
  }
}

export class MemoryAlertStateStore implements AlertStateStore {
  private state: AlertEnginePersistentState = emptyState();

  load(): AlertEnginePersistentState {
    return {
      dedup: this.state.dedup.map(([key, timestamp]) => [key, timestamp]),
      permanent: this.state.permanent.map(([key, timestamp]) => [key, timestamp]),
      ruleLastTriggered: this.state.ruleLastTriggered.map(([key, timestamp]) => [key, timestamp]),
    };
  }

  save(state: AlertEnginePersistentState): void {
    this.state = {
      dedup: sanitizeEntries(state.dedup),
      permanent: sanitizeEntries(state.permanent),
      ruleLastTriggered: sanitizeEntries(state.ruleLastTriggered),
    };
  }
}

export function createAlertStateStore(): AlertStateStore {
  const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  return isTestRuntime ? new MemoryAlertStateStore() : new JsonAlertStateStore();
}

export function getRuleLastTriggeredAt(path = getAlertStatePath()): ReadonlyMap<string, string> {
  const state = new JsonAlertStateStore(path).load();
  return new Map(state.ruleLastTriggered.map(([ruleId, timestamp]) => [ruleId, new Date(timestamp).toISOString()]));
}
