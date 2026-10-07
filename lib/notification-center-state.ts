export const NOTIFICATION_CENTER_STATE_VERSION = 1 as const;

export interface NotificationCenterServerState {
  version: typeof NOTIFICATION_CENTER_STATE_VERSION;
  lastSeen: string | null;
  mutedAircraft: string[];
  mutedRuleIds: string[];
  updatedAt: string | null;
}

export interface NotificationCenterStatePatch {
  lastSeen?: string | null;
  aircraft?: { icaoHex: string; muted: boolean };
  rule?: { id: string; muted: boolean };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function normalizeNotificationAircraftIcao(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

export function normalizeNotificationRuleId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 180 && !/[\r\n]/.test(normalized) ? normalized : null;
}

export function parseNotificationCenterServerState(input: unknown): NotificationCenterServerState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (row.version !== NOTIFICATION_CENTER_STATE_VERSION) return null;
  const lastSeen = row.lastSeen === null ? null : validTimestamp(row.lastSeen) ? new Date(row.lastSeen).toISOString() : null;
  if (row.lastSeen !== null && row.lastSeen !== undefined && lastSeen === null) return null;
  if (!Array.isArray(row.mutedAircraft) || !Array.isArray(row.mutedRuleIds)) return null;
  const mutedAircraft = row.mutedAircraft.map(normalizeNotificationAircraftIcao);
  const mutedRuleIds = row.mutedRuleIds.map(normalizeNotificationRuleId);
  if (mutedAircraft.some((value) => value === null) || mutedRuleIds.some((value) => value === null)) return null;
  const updatedAt = row.updatedAt === null ? null : validTimestamp(row.updatedAt) ? new Date(row.updatedAt).toISOString() : null;
  if (row.updatedAt !== null && row.updatedAt !== undefined && updatedAt === null) return null;
  return {
    version: NOTIFICATION_CENTER_STATE_VERSION,
    lastSeen,
    mutedAircraft: [...new Set(mutedAircraft as string[])].slice(0, 500),
    mutedRuleIds: [...new Set(mutedRuleIds as string[])].slice(0, 500),
    updatedAt,
  };
}

export function parseNotificationCenterStatePatch(input: unknown): NotificationCenterStatePatch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const allowed = new Set(["lastSeen", "aircraft", "rule"]);
  const keys = Object.keys(row);
  if (!keys.length || keys.some((key) => !allowed.has(key))) return null;
  const patch: NotificationCenterStatePatch = {};
  if ("lastSeen" in row) {
    if (row.lastSeen === null) patch.lastSeen = null;
    else if (validTimestamp(row.lastSeen)) patch.lastSeen = new Date(row.lastSeen).toISOString();
    else return null;
  }
  if ("aircraft" in row) {
    if (!row.aircraft || typeof row.aircraft !== "object" || Array.isArray(row.aircraft)) return null;
    const aircraft = row.aircraft as Record<string, unknown>;
    if (Object.keys(aircraft).some((key) => key !== "icaoHex" && key !== "muted")) return null;
    const icaoHex = normalizeNotificationAircraftIcao(aircraft.icaoHex);
    if (!icaoHex || typeof aircraft.muted !== "boolean") return null;
    patch.aircraft = { icaoHex, muted: aircraft.muted };
  }
  if ("rule" in row) {
    if (!row.rule || typeof row.rule !== "object" || Array.isArray(row.rule)) return null;
    const rule = row.rule as Record<string, unknown>;
    if (Object.keys(rule).some((key) => key !== "id" && key !== "muted")) return null;
    const id = normalizeNotificationRuleId(rule.id);
    if (!id || typeof rule.muted !== "boolean") return null;
    patch.rule = { id, muted: rule.muted };
  }
  return patch;
}
