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
  NOTIFICATION_CENTER_STATE_VERSION,
  parseNotificationCenterServerState,
  parseNotificationCenterStatePatch,
  type NotificationCenterServerState,
} from "@/lib/notification-center-state";
import { getRuntimeStateDirectory } from "@/lib/server/runtime-state";

export interface NotificationCenterStateStore {
  get(): NotificationCenterServerState;
  update(input: unknown): NotificationCenterServerState;
  isMuted(aircraftIcao: string, ruleIds?: readonly string[]): boolean;
}

export function getNotificationCenterStatePath(): string {
  return join(getRuntimeStateDirectory(), "notification-center-state.json");
}

function defaultState(): NotificationCenterServerState {
  return {
    version: NOTIFICATION_CENTER_STATE_VERSION,
    lastSeen: null,
    mutedAircraft: [],
    mutedRuleIds: [],
    updatedAt: null,
  };
}

function applyPatch(state: NotificationCenterServerState, input: unknown): NotificationCenterServerState {
  const patch = parseNotificationCenterStatePatch(input);
  if (!patch) throw new Error("invalid notification center state");
  const mutedAircraft = new Set(state.mutedAircraft);
  const mutedRuleIds = new Set(state.mutedRuleIds);
  if (patch.aircraft) {
    if (patch.aircraft.muted) mutedAircraft.add(patch.aircraft.icaoHex);
    else mutedAircraft.delete(patch.aircraft.icaoHex);
  }
  if (patch.rule) {
    if (patch.rule.muted) mutedRuleIds.add(patch.rule.id);
    else mutedRuleIds.delete(patch.rule.id);
  }
  return {
    version: NOTIFICATION_CENTER_STATE_VERSION,
    lastSeen: "lastSeen" in patch ? patch.lastSeen ?? null : state.lastSeen,
    mutedAircraft: [...mutedAircraft].slice(0, 500),
    mutedRuleIds: [...mutedRuleIds].slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
}

export class JsonNotificationCenterStateStore implements NotificationCenterStateStore {
  private state: NotificationCenterServerState;

  constructor(private readonly path = getNotificationCenterStatePath()) {
    this.state = this.load();
  }

  private load(): NotificationCenterServerState {
    if (!existsSync(this.path)) return defaultState();
    try {
      return parseNotificationCenterServerState(JSON.parse(readFileSync(this.path, "utf8")) as unknown) ?? defaultState();
    } catch {
      return defaultState();
    }
  }

  get(): NotificationCenterServerState {
    return {
      ...this.state,
      mutedAircraft: [...this.state.mutedAircraft],
      mutedRuleIds: [...this.state.mutedRuleIds],
    };
  }

  update(input: unknown): NotificationCenterServerState {
    const next = applyPatch(this.state, input);
    this.persist(next);
    this.state = next;
    return this.get();
  }

  isMuted(aircraftIcao: string, ruleIds: readonly string[] = []): boolean {
    const aircraft = aircraftIcao.trim().toUpperCase();
    return this.state.mutedAircraft.includes(aircraft) || ruleIds.some((id) => this.state.mutedRuleIds.includes(id));
  }

  private persist(state: NotificationCenterServerState): void {
    const directory = dirname(this.path);
    mkdirSync(directory, { recursive: true });
    const temporaryPath = join(directory, `.${basename(this.path)}.${process.pid}.${randomUUID()}.tmp`);
    let fd: number | null = null;
    try {
      fd = openSync(temporaryPath, "wx", 0o600);
      writeFileSync(fd, `${JSON.stringify(state)}\n`, "utf8");
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

export class MemoryNotificationCenterStateStore implements NotificationCenterStateStore {
  private state = defaultState();

  get(): NotificationCenterServerState {
    return { ...this.state, mutedAircraft: [...this.state.mutedAircraft], mutedRuleIds: [...this.state.mutedRuleIds] };
  }

  update(input: unknown): NotificationCenterServerState {
    this.state = applyPatch(this.state, input);
    return this.get();
  }

  isMuted(aircraftIcao: string, ruleIds: readonly string[] = []): boolean {
    const aircraft = aircraftIcao.trim().toUpperCase();
    return this.state.mutedAircraft.includes(aircraft) || ruleIds.some((id) => this.state.mutedRuleIds.includes(id));
  }
}

const globalForNotificationCenterState = globalThis as unknown as {
  notificationCenterStateStore?: NotificationCenterStateStore;
};

export function getNotificationCenterStateStore(): NotificationCenterStateStore {
  if (!globalForNotificationCenterState.notificationCenterStateStore) {
    const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
    globalForNotificationCenterState.notificationCenterStateStore = isTestRuntime
      ? new MemoryNotificationCenterStateStore()
      : new JsonNotificationCenterStateStore();
  }
  return globalForNotificationCenterState.notificationCenterStateStore;
}
