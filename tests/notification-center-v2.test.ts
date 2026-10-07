import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterNotificationGroups,
  groupNotificationEntries,
  notificationRuleReferences,
  notificationWhyCode,
} from "@/lib/notification-center";
import {
  parseNotificationCenterServerState,
} from "@/lib/notification-center-state";
import {
  JsonNotificationCenterStateStore,
  MemoryNotificationCenterStateStore,
} from "@/lib/server/notification-center-state";
import type { AlertHistoryEntry } from "@/lib/server/alert-history";

function entry(
  id: string,
  type: AlertHistoryEntry["type"],
  status: AlertHistoryEntry["notificationStatus"],
  detectedAt: string,
  overrides: Partial<AlertHistoryEntry> = {},
): AlertHistoryEntry {
  const base: AlertHistoryEntry = {
    id,
    detectedAt,
    type,
    reason: type === "entered_radius" ? "entered_radius"
      : type === "new_aircraft" ? "new"
      : type === "reception_record" ? "record"
      : type.startsWith("emergency") ? "emergency"
      : type.startsWith("intelligence_") ? "approach"
      : type === "predictive_eta" ? "eta_threshold"
      : "watchlisted",
    aircraft: { icaoHex: "48AF05", registration: "OK-TST", callsign: "TEST1", aircraftType: "A320" },
    ruleIds: [],
    ruleNames: [],
    radiusKm: null,
    squawk: type.startsWith("emergency") ? "7700" : null,
    record: null,
    notificationStatus: status,
    notificationAttemptedAt: null,
    intelligence: type.startsWith("intelligence_")
      ? { eventType: "APPROACH", confidenceLevel: "high", airportIcao: "LKPR", sectorId: null }
      : null,
  };
  return { ...base, ...overrides };
}

describe("Notification Center V2 server state", () => {
  it("persists unread state and reversible aircraft/rule mutes", () => {
    const store = new MemoryNotificationCenterStateStore();
    const first = store.update({ lastSeen: "2026-10-07T10:00:00Z" });
    expect(first.lastSeen).toBe("2026-10-07T10:00:00.000Z");

    store.update({ aircraft: { icaoHex: "48af05", muted: true } });
    store.update({ rule: { id: "watch-1", muted: true } });
    expect(store.isMuted("48AF05")).toBe(true);
    expect(store.isMuted("ABC123", ["watch-1"])).toBe(true);

    const next = store.update({
      aircraft: { icaoHex: "48AF05", muted: false },
      rule: { id: "watch-1", muted: false },
    });
    expect(next.mutedAircraft).toEqual([]);
    expect(next.mutedRuleIds).toEqual([]);
  });

  it("persists atomically and fails safely for malformed state", () => {
    const directory = mkdtempSync(join(tmpdir(), "airradar-notification-center-"));
    const path = join(directory, "state.json");
    try {
      const store = new JsonNotificationCenterStateStore(path);
      store.update({ aircraft: { icaoHex: "48AF05", muted: true } });
      expect(new JsonNotificationCenterStateStore(path).get().mutedAircraft).toEqual(["48AF05"]);

      writeFileSync(path, "{broken", "utf8");
      expect(new JsonNotificationCenterStateStore(path).get()).toMatchObject({
        lastSeen: null,
        mutedAircraft: [],
        mutedRuleIds: [],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed public state DTOs", () => {
    expect(parseNotificationCenterServerState({
      version: 1,
      lastSeen: "not-a-date",
      mutedAircraft: [],
      mutedRuleIds: [],
      updatedAt: null,
    })).toBeNull();
  });
});

describe("Notification Center V2 filters and rationale", () => {
  const groups = groupNotificationEntries([
    entry("watch", "entered_radius", "delivered", "2026-10-07T10:00:00Z", {
      ruleIds: ["watch-1"],
      ruleNames: ["Near Prague"],
    }),
    entry("emergency", "emergency_7700", "failed", "2026-10-07T10:10:00Z", {
      aircraft: { icaoHex: "ABC123", registration: null, callsign: "MAYDAY1", aircraftType: "B738" },
    }),
    entry("record", "reception_record", "center_only", "2026-10-07T10:20:00Z", {
      aircraft: { icaoHex: "DEF456", registration: "OK-REC", callsign: null, aircraftType: null },
    }),
  ]);

  it("filters by family, delivery result and aircraft identity", () => {
    expect(filterNotificationGroups(groups, { category: "WATCHLIST", delivery: "DELIVERED", query: "" })).toHaveLength(1);
    expect(filterNotificationGroups(groups, { category: "EMERGENCY", delivery: "FAILED", query: "mayday1" })).toHaveLength(1);
    expect(filterNotificationGroups(groups, { category: "RECORDS", delivery: "CENTER_ONLY", query: "DEF456" })).toHaveLength(1);
    expect(filterNotificationGroups(groups, { category: "ALL", delivery: "ALL", query: "Near Prague" })).toHaveLength(1);
  });

  it("explains why canonical events were raised", () => {
    expect(notificationWhyCode(entry("r", "entered_radius", "delivered", "2026-10-07T10:00:00Z"))).toBe("entered_radius");
    expect(notificationWhyCode(entry("e", "emergency_7700", "delivered", "2026-10-07T10:00:00Z"))).toBe("emergency_squawk");
    expect(notificationWhyCode(entry("n", "new_aircraft", "center_only", "2026-10-07T10:00:00Z"))).toBe("first_seen");
    expect(notificationWhyCode(entry("p", "predictive_eta", "delivered", "2026-10-07T10:00:00Z"))).toBe("predictive_rule");
  });

  it("keeps durable and legacy rule links distinct", () => {
    const group = groupNotificationEntries([
      entry("legacy", "watchlist", "delivered", "2026-10-07T10:00:00Z", {
        ruleIds: ["watch-1"],
        ruleNames: ["Legacy watch"],
      }),
      entry("durable", "alert_v1", "center_only", "2026-10-07T10:01:00Z", {
        reason: "alert_v1",
        aircraft: { icaoHex: "48AF05", registration: "OK-TST", callsign: "TEST1", aircraftType: null },
        ruleIds: ["durable-1"],
        ruleNames: ["Durable rule"],
        alertV1: {
          occurrenceId: "occ-1",
          ruleId: "durable-1",
          sourceType: "GEOFENCE",
          sourceKey: "source-1",
          trigger: "GEOFENCE_ENTER",
          ruleName: "Durable rule",
          flightEventId: null,
          flightEventType: null,
          airportIcao: null,
          runway: null,
          geofenceId: "geo-1",
          deliveryStatus: "center_only",
        },
      }),
    ])[0]!;

    expect(notificationRuleReferences(group)).toEqual(expect.arrayContaining([
      { id: "watch-1", label: "Legacy watch", kind: "watchlist" },
      { id: "durable-1", label: "Durable rule", kind: "durable" },
    ]));
  });
});
