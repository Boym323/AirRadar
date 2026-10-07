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
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferencePatch,
  parseNotificationPreferenceValues,
  type NotificationPreferenceMode,
  type NotificationPreferenceValues,
  type NotificationPreferencesSnapshot,
} from "@/lib/notification-preferences";
import { getRuntimeStateDirectory } from "@/lib/server/runtime-state";

const VERSION = 1 as const;

interface StoredNotificationPreferences {
  version: typeof VERSION;
  values: NotificationPreferenceValues;
  updatedAt: string;
}

export interface NotificationPreferencesStore {
  get(): NotificationPreferencesSnapshot;
  update(input: unknown): NotificationPreferencesSnapshot;
}

export function getNotificationPreferencesPath(): string {
  return join(getRuntimeStateDirectory(), "notification-preferences.json");
}

function defaultSnapshot(): NotificationPreferencesSnapshot {
  return { version: VERSION, values: { ...DEFAULT_NOTIFICATION_PREFERENCES }, updatedAt: null };
}

function parseStored(value: unknown): NotificationPreferencesSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultSnapshot();
  const row = value as Record<string, unknown>;
  if (row.version !== VERSION) return defaultSnapshot();
  const values = parseNotificationPreferenceValues(row.values);
  if (!values) return defaultSnapshot();
  const updatedAt = typeof row.updatedAt === "string" && Number.isFinite(Date.parse(row.updatedAt))
    ? new Date(row.updatedAt).toISOString()
    : null;
  return { version: VERSION, values, updatedAt };
}

export class JsonNotificationPreferencesStore implements NotificationPreferencesStore {
  private snapshot: NotificationPreferencesSnapshot;

  constructor(private readonly path = getNotificationPreferencesPath()) {
    this.snapshot = this.load();
  }

  private load(): NotificationPreferencesSnapshot {
    if (!existsSync(this.path)) return defaultSnapshot();
    try {
      return parseStored(JSON.parse(readFileSync(this.path, "utf8")) as unknown);
    } catch {
      return defaultSnapshot();
    }
  }

  get(): NotificationPreferencesSnapshot {
    return {
      version: VERSION,
      values: { ...this.snapshot.values },
      updatedAt: this.snapshot.updatedAt,
    };
  }

  update(input: unknown): NotificationPreferencesSnapshot {
    const patch = parseNotificationPreferencePatch(input);
    if (!patch) throw new Error("invalid notification preferences");
    const next: NotificationPreferencesSnapshot = {
      version: VERSION,
      values: { ...this.snapshot.values, ...patch },
      updatedAt: new Date().toISOString(),
    };
    this.persist(next);
    this.snapshot = next;
    return this.get();
  }

  private persist(snapshot: NotificationPreferencesSnapshot): void {
    const directory = dirname(this.path);
    mkdirSync(directory, { recursive: true });
    const temporaryPath = join(directory, `.${basename(this.path)}.${process.pid}.${randomUUID()}.tmp`);
    const payload: StoredNotificationPreferences = {
      version: VERSION,
      values: snapshot.values,
      updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
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

export class MemoryNotificationPreferencesStore implements NotificationPreferencesStore {
  private snapshot = defaultSnapshot();

  get(): NotificationPreferencesSnapshot {
    return { version: VERSION, values: { ...this.snapshot.values }, updatedAt: this.snapshot.updatedAt };
  }

  update(input: unknown): NotificationPreferencesSnapshot {
    const patch = parseNotificationPreferencePatch(input);
    if (!patch) throw new Error("invalid notification preferences");
    this.snapshot = {
      version: VERSION,
      values: { ...this.snapshot.values, ...patch },
      updatedAt: new Date().toISOString(),
    };
    return this.get();
  }
}

const globalForNotificationPreferences = globalThis as unknown as {
  notificationPreferencesStore?: NotificationPreferencesStore;
};

export function getNotificationPreferencesStore(): NotificationPreferencesStore {
  if (!globalForNotificationPreferences.notificationPreferencesStore) {
    const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
    globalForNotificationPreferences.notificationPreferencesStore = isTestRuntime
      ? new MemoryNotificationPreferencesStore()
      : new JsonNotificationPreferencesStore();
  }
  return globalForNotificationPreferences.notificationPreferencesStore;
}

export function notificationPreferenceMode(key: keyof NotificationPreferenceValues): NotificationPreferenceMode {
  return getNotificationPreferencesStore().get().values[key];
}

export function notificationModeForDurableSignal(signal: { sourceType: string; trigger: string }): NotificationPreferenceMode {
  if (signal.trigger === "SQUAWK") return notificationPreferenceMode("emergency");
  if (signal.sourceType === "FLIGHT_EVENT") return notificationPreferenceMode("flightIntelligence");
  return notificationPreferenceMode("watchlist");
}

export function channelsForNotificationMode(mode: NotificationPreferenceMode, channels: readonly string[]): string[] | null {
  if (mode === "OFF") return null;
  if (mode === "CENTER_ONLY") return [];
  return [...channels];
}
