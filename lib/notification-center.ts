import type { AlertHistoryEntry, AlertNotificationStatus } from "@/lib/server/alert-history";

export const NOTIFICATION_CENTER_STORAGE_KEY = "airradar.notifications.v1";
export const NOTIFICATION_CENTER_STORAGE_VERSION = 1 as const;
export const NOTIFICATION_CENTER_PAGE_SIZE = 50;
export const NOTIFICATION_GROUP_WINDOW_MS = 5 * 60_000;
export const NOTIFICATION_SEMANTIC_DEDUP_WINDOW_MS = 15_000;

export type NotificationCenterCategory = "WATCHLIST" | "INTELLIGENCE" | "EMERGENCY" | "FIRST SEEN" | "RECEPTION RECORD" | "PREDICTIVE";

export interface NotificationCenterLocalState {
  version: typeof NOTIFICATION_CENTER_STORAGE_VERSION;
  lastSeen: string;
}

export interface NotificationGroup {
  id: string;
  aircraftIcao: string;
  primary: AlertHistoryEntry;
  entries: AlertHistoryEntry[];
  latestAt: string;
  earliestAt: string;
  notificationStatus: AlertNotificationStatus;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseNotificationCenterLocalState(value: string | null): NotificationCenterLocalState | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;
    if (row.version !== NOTIFICATION_CENTER_STORAGE_VERSION || !validTimestamp(row.lastSeen)) return null;
    return { version: NOTIFICATION_CENTER_STORAGE_VERSION, lastSeen: new Date(row.lastSeen).toISOString() };
  } catch {
    return null;
  }
}

export function serializeNotificationCenterLocalState(lastSeen: string): string {
  const timestamp = validTimestamp(lastSeen) ? new Date(lastSeen).toISOString() : new Date(0).toISOString();
  return JSON.stringify({ version: NOTIFICATION_CENTER_STORAGE_VERSION, lastSeen: timestamp });
}

export function notificationCategory(entry: AlertHistoryEntry): NotificationCenterCategory {
  if (entry.type === "emergency"
    || entry.type === "emergency_7500"
    || entry.type === "emergency_7600"
    || entry.type === "emergency_7700"
    || (entry.type === "alert_v1" && entry.alertV1?.trigger === "SQUAWK")) return "EMERGENCY";
  if (entry.type === "new_aircraft") return "FIRST SEEN";
  if (entry.type === "reception_record") return "RECEPTION RECORD";
  if (entry.type === "predictive_eta" || entry.type === "predictive_runway_change") return "PREDICTIVE";
  if (entry.type.startsWith("intelligence_")) return "INTELLIGENCE";
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType === "FLIGHT_EVENT") return "INTELLIGENCE";
  return "WATCHLIST";
}

export function dedupeNotificationEntries(entries: readonly AlertHistoryEntry[]): AlertHistoryEntry[] {
  const sorted = [...entries].sort((a, b) =>
    Date.parse(b.detectedAt) - Date.parse(a.detectedAt) || b.id.localeCompare(a.id));
  const seen = new Set<string>();
  return sorted.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function normalizedIcao(entry: AlertHistoryEntry): string {
  return entry.aircraft.icaoHex.trim().toUpperCase() || "UNKNOWN";
}

function semanticEventKey(entry: AlertHistoryEntry): string | null {
  const icao = normalizedIcao(entry);
  if (notificationCategory(entry) === "EMERGENCY") {
    const squawk = entry.squawk ?? (entry.type.startsWith("emergency_") ? entry.type.slice("emergency_".length) : "unknown");
    return `${icao}:emergency:${squawk}`;
  }
  if (entry.type.startsWith("intelligence_")) {
    return `${icao}:intelligence:${entry.intelligence?.eventType ?? entry.type.slice("intelligence_".length)}`.toUpperCase();
  }
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType === "FLIGHT_EVENT" && entry.alertV1.flightEventType) {
    return `${icao}:intelligence:${entry.alertV1.flightEventType}`.toUpperCase();
  }
  return null;
}

function statusPriority(status: AlertNotificationStatus): number {
  if (status === "failed") return 5;
  if (status === "delivered") return 4;
  if (status === "attempted") return 3;
  if (status === "pending") return 2;
  return 1;
}

function combinedNotificationStatus(entries: readonly AlertHistoryEntry[]): AlertNotificationStatus {
  return entries.reduce<AlertNotificationStatus>((best, entry) =>
    statusPriority(entry.notificationStatus) > statusPriority(best) ? entry.notificationStatus : best, "disabled");
}

function latestTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function mergeSemanticDuplicate(preferred: AlertHistoryEntry, duplicate: AlertHistoryEntry): AlertHistoryEntry {
  const primary = preferred.type === "alert_v1" && duplicate.type !== "alert_v1" ? duplicate : preferred;
  const secondary = primary === preferred ? duplicate : preferred;
  return {
    ...primary,
    detectedAt: Date.parse(preferred.detectedAt) >= Date.parse(duplicate.detectedAt) ? preferred.detectedAt : duplicate.detectedAt,
    ruleIds: [...new Set([...preferred.ruleIds, ...duplicate.ruleIds])],
    ruleNames: [...new Set([...preferred.ruleNames, ...duplicate.ruleNames])],
    notificationStatus: combinedNotificationStatus([preferred, duplicate]),
    notificationAttemptedAt: latestTimestamp(preferred.notificationAttemptedAt, duplicate.notificationAttemptedAt),
    intelligence: primary.intelligence ?? secondary.intelligence,
    alertV1: preferred.alertV1 ?? duplicate.alertV1,
  };
}

/**
 * Collapses only narrow same-aircraft emergency / Flight Intelligence duplicates
 * emitted by the legacy and durable alert lanes within a few seconds. Other
 * event families remain independent canonical timeline items.
 */
export function dedupeSemanticNotificationEntries(entries: readonly AlertHistoryEntry[]): AlertHistoryEntry[] {
  const unique = dedupeNotificationEntries(entries);
  const output: AlertHistoryEntry[] = [];
  const semanticIndex = new Map<string, number>();
  for (const entry of unique) {
    const key = semanticEventKey(entry);
    if (!key) {
      output.push(entry);
      continue;
    }
    const existingIndex = semanticIndex.get(key);
    if (existingIndex === undefined) {
      semanticIndex.set(key, output.length);
      output.push(entry);
      continue;
    }
    const existing = output[existingIndex]!;
    if (Math.abs(Date.parse(existing.detectedAt) - Date.parse(entry.detectedAt)) > NOTIFICATION_SEMANTIC_DEDUP_WINDOW_MS) {
      semanticIndex.set(key, output.length);
      output.push(entry);
      continue;
    }
    output[existingIndex] = mergeSemanticDuplicate(existing, entry);
  }
  return output.sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt) || b.id.localeCompare(a.id));
}

function eventPriority(entry: AlertHistoryEntry): number {
  if (notificationCategory(entry) === "EMERGENCY") return 100;
  if (entry.type === "intelligence_go_around" || entry.type === "intelligence_diversion") return 95;
  if (entry.type === "predictive_runway_change") return 90;
  if (entry.type === "predictive_eta") return 85;
  if (entry.type === "entered_radius") return 80;
  if (entry.type === "intelligence_holding") return 78;
  if (entry.type === "intelligence_landing" || entry.type === "intelligence_approach" || entry.type === "intelligence_takeoff") return 75;
  if (entry.type === "alert_v1" && entry.alertV1?.sourceType === "FLIGHT_EVENT") return 75;
  if (entry.type === "aircraft_appeared" || entry.type === "watchlist") return 60;
  if (entry.type === "new_aircraft") return 30;
  if (entry.type === "reception_record") return 20;
  return 50;
}

export function primaryNotificationEntry(entries: readonly AlertHistoryEntry[]): AlertHistoryEntry {
  if (!entries.length) throw new Error("notification group requires at least one entry");
  return entries.reduce((best, entry) => {
    const priorityDelta = eventPriority(entry) - eventPriority(best);
    if (priorityDelta > 0) return entry;
    if (priorityDelta < 0) return best;
    return Date.parse(entry.detectedAt) > Date.parse(best.detectedAt) ? entry : best;
  });
}

export function groupNotificationEntries(entries: readonly AlertHistoryEntry[], windowMs = NOTIFICATION_GROUP_WINDOW_MS): NotificationGroup[] {
  const grouped: NotificationGroup[] = [];
  const activeByAircraft = new Map<string, NotificationGroup>();
  for (const entry of dedupeSemanticNotificationEntries(entries)) {
    const aircraftIcao = normalizedIcao(entry);
    const detectedAtMs = Date.parse(entry.detectedAt);
    const active = activeByAircraft.get(aircraftIcao);
    const activeLatestMs = active ? Date.parse(active.latestAt) : Number.NaN;
    if (active && Number.isFinite(detectedAtMs) && Number.isFinite(activeLatestMs) && activeLatestMs - detectedAtMs <= windowMs) {
      active.entries.push(entry);
      active.earliestAt = entry.detectedAt;
      active.primary = primaryNotificationEntry(active.entries);
      active.notificationStatus = combinedNotificationStatus(active.entries);
      continue;
    }
    const group: NotificationGroup = {
      id: `notification-group:${aircraftIcao}:${entry.id}`,
      aircraftIcao,
      primary: entry,
      entries: [entry],
      latestAt: entry.detectedAt,
      earliestAt: entry.detectedAt,
      notificationStatus: entry.notificationStatus,
    };
    grouped.push(group);
    activeByAircraft.set(aircraftIcao, group);
  }
  return grouped;
}

export function notificationCenterMetrics(entries: readonly AlertHistoryEntry[], lastSeen: string | null) {
  const unique = dedupeSemanticNotificationEntries(entries);
  const seenAt = lastSeen && Number.isFinite(Date.parse(lastSeen)) ? Date.parse(lastSeen) : null;
  return {
    recent: unique.length,
    delivered: unique.filter((entry) => entry.notificationStatus === "delivered").length,
    failed: unique.filter((entry) => entry.notificationStatus === "failed").length,
    unread: seenAt === null ? 0 : unique.filter((entry) => Date.parse(entry.detectedAt) > seenAt).length,
  };
}
