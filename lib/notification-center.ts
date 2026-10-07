import type { AlertHistoryEntry } from "@/lib/server/alert-history";

export const NOTIFICATION_CENTER_STORAGE_KEY = "airradar.notifications.v1";
export const NOTIFICATION_CENTER_STORAGE_VERSION = 1 as const;
export const NOTIFICATION_CENTER_PAGE_SIZE = 50;

export type NotificationCenterCategory = "WATCHLIST" | "INTELLIGENCE" | "EMERGENCY" | "FIRST SEEN" | "RECEPTION RECORD" | "PREDICTIVE";

export interface NotificationCenterLocalState {
  version: typeof NOTIFICATION_CENTER_STORAGE_VERSION;
  lastSeen: string;
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

export function notificationCenterMetrics(entries: readonly AlertHistoryEntry[], lastSeen: string | null) {
  const unique = dedupeNotificationEntries(entries);
  const seenAt = lastSeen && Number.isFinite(Date.parse(lastSeen)) ? Date.parse(lastSeen) : null;
  return {
    recent: unique.length,
    delivered: unique.filter((entry) => entry.notificationStatus === "delivered").length,
    failed: unique.filter((entry) => entry.notificationStatus === "failed").length,
    unread: seenAt === null ? 0 : unique.filter((entry) => Date.parse(entry.detectedAt) > seenAt).length,
  };
}
