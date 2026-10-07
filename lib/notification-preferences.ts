import type { AlertHistoryEventType } from "@/lib/server/alert-history";

export const NOTIFICATION_PREFERENCE_KEYS = [
  "watchlist",
  "emergency",
  "firstSeen",
  "receptionRecord",
  "flightIntelligence",
  "predictive",
] as const;

export type NotificationPreferenceKey = typeof NOTIFICATION_PREFERENCE_KEYS[number];
export type NotificationPreferenceMode = "OFF" | "CENTER_ONLY" | "PUSH";

export type NotificationPreferenceValues = Record<NotificationPreferenceKey, NotificationPreferenceMode>;

export interface NotificationPreferencesSnapshot {
  version: 1;
  values: NotificationPreferenceValues;
  updatedAt: string | null;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceValues = {
  watchlist: "PUSH",
  emergency: "PUSH",
  firstSeen: "CENTER_ONLY",
  receptionRecord: "CENTER_ONLY",
  flightIntelligence: "PUSH",
  predictive: "PUSH",
};

export function isNotificationPreferenceMode(value: unknown): value is NotificationPreferenceMode {
  return value === "OFF" || value === "CENTER_ONLY" || value === "PUSH";
}

export function parseNotificationPreferenceValues(input: unknown): NotificationPreferenceValues | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const values = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const key of NOTIFICATION_PREFERENCE_KEYS) {
    if (!isNotificationPreferenceMode(record[key])) return null;
    values[key] = record[key];
  }
  return values;
}

export function parseNotificationPreferencePatch(input: unknown): Partial<NotificationPreferenceValues> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const allowed = new Set<string>(NOTIFICATION_PREFERENCE_KEYS);
  const keys = Object.keys(record);
  if (!keys.length || keys.some((key) => !allowed.has(key))) return null;
  const patch: Partial<NotificationPreferenceValues> = {};
  for (const key of keys) {
    if (!isNotificationPreferenceMode(record[key])) return null;
    patch[key as NotificationPreferenceKey] = record[key] as NotificationPreferenceMode;
  }
  return patch;
}

export function notificationPreferenceKeyForEvent(
  type: AlertHistoryEventType | undefined,
  emergency = false,
): NotificationPreferenceKey | null {
  if (emergency || type === "emergency" || type === "emergency_7500" || type === "emergency_7600" || type === "emergency_7700") return "emergency";
  if (type === "new_aircraft") return "firstSeen";
  if (type === "reception_record") return "receptionRecord";
  if (type?.startsWith("intelligence_")) return "flightIntelligence";
  if (type === "predictive_eta" || type === "predictive_runway_change") return "predictive";
  if (type === "watchlist" || type === "aircraft_appeared" || type === "entered_radius") return "watchlist";
  return null;
}
