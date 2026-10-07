import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_CENTER_PAGE_SIZE,
  NOTIFICATION_CENTER_STORAGE_KEY,
  dedupeNotificationEntries,
  notificationCategory,
  notificationCenterMetrics,
  parseNotificationCenterLocalState,
} from "@/lib/notification-center";
import type { AlertHistoryEntry } from "@/lib/server/alert-history";

function entry(id: string, type: AlertHistoryEntry["type"], status: AlertHistoryEntry["notificationStatus"], detectedAt: string): AlertHistoryEntry {
  return {
    id,
    detectedAt,
    type,
    reason: type === "reception_record" ? "record" : type.startsWith("emergency") ? "emergency" : type.startsWith("intelligence_") ? "approach" : "watchlisted",
    aircraft: { icaoHex: "48AF05", registration: "OK-TST", callsign: "TEST1", aircraftType: "A320" },
    ruleIds: [],
    ruleNames: [],
    radiusKm: null,
    squawk: type.startsWith("emergency") ? "7700" : null,
    record: null,
    notificationStatus: status,
    notificationAttemptedAt: null,
    intelligence: type.startsWith("intelligence_") ? { eventType: "APPROACH", confidenceLevel: "high", airportIcao: "LKPR", sectorId: null } : null,
  };
}

describe("Notification Center V1 aggregation", () => {
  it("categorizes only the canonical event families exposed by alert history", () => {
    expect(notificationCategory(entry("w", "watchlist", "pending", "2026-10-06T10:00:00Z"))).toBe("WATCHLIST");
    expect(notificationCategory(entry("i", "intelligence_approach", "delivered", "2026-10-06T10:01:00Z"))).toBe("INTELLIGENCE");
    expect(notificationCategory(entry("e", "emergency_7700", "failed", "2026-10-06T10:02:00Z"))).toBe("EMERGENCY");
    expect(notificationCategory(entry("n", "new_aircraft", "center_only", "2026-10-06T10:03:00Z"))).toBe("FIRST SEEN");
    expect(notificationCategory(entry("r", "reception_record", "center_only", "2026-10-06T10:04:00Z"))).toBe("RECEPTION RECORD");
    expect(notificationCategory(entry("p", "predictive_eta", "delivered", "2026-10-06T10:05:00Z"))).toBe("PREDICTIVE");
  });

  it("deduplicates by canonical event id before counting status and unread", () => {
    const items = [
      entry("same", "watchlist", "delivered", "2026-10-06T10:02:00Z"),
      entry("same", "watchlist", "failed", "2026-10-06T10:01:00Z"),
      entry("other", "emergency_7700", "failed", "2026-10-06T10:03:00Z"),
    ];
    expect(dedupeNotificationEntries(items)).toHaveLength(2);
    expect(notificationCenterMetrics(items, "2026-10-06T10:01:30Z")).toEqual({
      recent: 2,
      delivered: 1,
      failed: 1,
      unread: 2,
    });
  });

  it("keeps a browser-local unread fallback and fails closed for corrupt data", () => {
    expect(NOTIFICATION_CENTER_STORAGE_KEY).toBe("airradar.notifications.v1");
    expect(parseNotificationCenterLocalState("not-json")).toBeNull();
    expect(parseNotificationCenterLocalState('{"version":2,"lastSeen":"2026-10-06T10:00:00Z"}')).toBeNull();
    expect(parseNotificationCenterLocalState('{"version":1,"lastSeen":"2026-10-06T10:00:00Z"}')).toEqual({
      version: 1,
      lastSeen: "2026-10-06T10:00:00.000Z",
    });
  });
});

describe("Notification Center V2 boundaries", () => {
  const source = readFileSync(new URL("../components/notification-center.tsx", import.meta.url), "utf8");
  const historyRoute = readFileSync(new URL("../app/api/alerts/route.ts", import.meta.url), "utf8");
  const deliveryRoute = readFileSync(new URL("../app/api/admin/alerts/delivery/route.ts", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../lib/server/alert-engine.ts", import.meta.url), "utf8");

  it("keeps history bounded and reuses authenticated admin delivery state", () => {
    expect(NOTIFICATION_CENTER_PAGE_SIZE).toBe(50);
    expect(source).toContain("/api/alerts?page=0&pageSize=");
    expect(source).toContain("/api/admin/alerts/delivery?view=preferences");
    expect(source).toContain("/api/admin/alerts/delivery?view=notification-state");
    expect(source).toContain('method: "PATCH"');
    expect(historyRoute).toContain("listAlertHistory");
    expect(deliveryRoute).toContain("isWatchlistSessionValid");
    expect(deliveryRoute).toContain("requireWatchlistMutation");
    expect(deliveryRoute).toContain("getNotificationPreferencesStore");
    expect(deliveryRoute).toContain("getNotificationCenterStateStore");
  });

  it("adds no detector, scheduler or parallel notification API", () => {
    expect(source).not.toContain("/api/notifications");
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("EventSource");
    expect(engine).toContain("notificationModeForDurableSignal");
    expect(engine).toContain("channelsForNotificationMode");
    expect(engine).toContain("notificationMuted");
  });
});
