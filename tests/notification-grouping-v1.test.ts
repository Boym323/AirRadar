import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_GROUP_WINDOW_MS,
  NOTIFICATION_SEMANTIC_DEDUP_WINDOW_MS,
  dedupeSemanticNotificationEntries,
  groupNotificationEntries,
  primaryNotificationEntry,
} from "@/lib/notification-center";
import type { AlertHistoryEntry } from "@/lib/server/alert-history";

function entry(
  id: string,
  type: AlertHistoryEntry["type"],
  detectedAt: string,
  overrides: Partial<AlertHistoryEntry> = {},
): AlertHistoryEntry {
  const base: AlertHistoryEntry = {
    id,
    detectedAt,
    type,
    reason: type === "new_aircraft" ? "new"
      : type === "reception_record" ? "record"
      : type.startsWith("emergency") ? "emergency"
      : type.startsWith("intelligence_") ? "approach"
      : type === "predictive_eta" ? "eta_threshold"
      : type === "predictive_runway_change" ? "runway_change"
      : type === "entered_radius" ? "entered_radius"
      : type === "aircraft_appeared" ? "appeared"
      : "watchlisted",
    aircraft: { icaoHex: "48AF05", registration: "OK-TST", callsign: "TEST1", aircraftType: "A320" },
    ruleIds: [],
    ruleNames: [],
    radiusKm: null,
    squawk: type.startsWith("emergency") ? "7700" : null,
    record: null,
    notificationStatus: "delivered",
    notificationAttemptedAt: null,
    intelligence: type.startsWith("intelligence_")
      ? { eventType: type.slice("intelligence_".length).toUpperCase(), confidenceLevel: "high", airportIcao: "LKPR", sectorId: null }
      : null,
  };
  return { ...base, ...overrides };
}

describe("Notification Dedup & Grouping V1", () => {
  it("collapses the same Flight Intelligence event emitted by legacy and durable lanes", () => {
    const canonical = entry("canonical", "intelligence_go_around", "2026-10-07T10:00:10Z", {
      ruleNames: ["Legacy watchlist"],
    });
    const durable = entry("v1", "alert_v1", "2026-10-07T10:00:05Z", {
      reason: "alert_v1",
      notificationStatus: "pending",
      ruleIds: ["rule-1"],
      ruleNames: ["Go-around durable"],
      intelligence: null,
      alertV1: {
        occurrenceId: "occ-1",
        sourceType: "FLIGHT_EVENT",
        sourceKey: "flight-event-42",
        trigger: "FLIGHT_EVENT",
        ruleName: "Go-around durable",
        flightEventId: 42,
        flightEventType: "GO_AROUND",
        airportIcao: "LKPR",
        runway: null,
        geofenceId: null,
        deliveryStatus: "pending",
      },
    });

    const deduped = dedupeSemanticNotificationEntries([durable, canonical]);

    expect(NOTIFICATION_SEMANTIC_DEDUP_WINDOW_MS).toBe(15_000);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.type).toBe("intelligence_go_around");
    expect(deduped[0]?.ruleNames).toEqual(expect.arrayContaining(["Legacy watchlist", "Go-around durable"]));
    expect(deduped[0]?.alertV1?.flightEventId).toBe(42);
    expect(deduped[0]?.notificationStatus).toBe("delivered");
  });

  it("does not collapse repeated semantic events outside the narrow dedup window", () => {
    const first = entry("first", "intelligence_approach", "2026-10-07T10:00:00Z");
    const second = entry("second", "intelligence_approach", "2026-10-07T10:00:16Z");
    expect(dedupeSemanticNotificationEntries([first, second])).toHaveLength(2);
  });

  it("groups one aircraft into a bounded five-minute timeline and promotes the most important change", () => {
    const items = [
      entry("new", "new_aircraft", "2026-10-07T10:00:00Z", { notificationStatus: "disabled" }),
      entry("seen", "aircraft_appeared", "2026-10-07T10:01:00Z"),
      entry("radius", "entered_radius", "2026-10-07T10:02:00Z"),
      entry("approach", "intelligence_approach", "2026-10-07T10:03:00Z"),
      entry("eta", "predictive_eta", "2026-10-07T10:04:00Z"),
    ];

    const groups = groupNotificationEntries(items);

    expect(NOTIFICATION_GROUP_WINDOW_MS).toBe(5 * 60_000);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries).toHaveLength(5);
    expect(groups[0]?.primary.type).toBe("predictive_eta");
    expect(groups[0]?.latestAt).toBe("2026-10-07T10:04:00Z");
    expect(groups[0]?.earliestAt).toBe("2026-10-07T10:00:00Z");
  });

  it("keeps reacquisition semantics instead of presenting it as first seen", () => {
    const firstSeen = entry("new", "new_aircraft", "2026-10-07T10:00:00Z", { notificationStatus: "disabled" });
    const reacquired = entry("again", "aircraft_appeared", "2026-10-07T10:01:00Z");
    const group = groupNotificationEntries([firstSeen, reacquired])[0]!;

    expect(group.primary.type).toBe("aircraft_appeared");
    expect(primaryNotificationEntry(group.entries).type).toBe("aircraft_appeared");
  });

  it("always promotes emergency above informational and predictive events", () => {
    const group = groupNotificationEntries([
      entry("eta", "predictive_eta", "2026-10-07T10:03:00Z"),
      entry("emergency", "emergency_7700", "2026-10-07T10:02:00Z", { notificationStatus: "failed" }),
      entry("radius", "entered_radius", "2026-10-07T10:01:00Z"),
    ])[0]!;

    expect(group.primary.type).toBe("emergency_7700");
    expect(group.notificationStatus).toBe("failed");
  });

  it("does not group different aircraft or stretch a thread beyond its five-minute anchor", () => {
    const groups = groupNotificationEntries([
      entry("newer", "watchlist", "2026-10-07T10:10:00Z"),
      entry("other", "watchlist", "2026-10-07T10:09:00Z", {
        aircraft: { icaoHex: "ABC123", registration: null, callsign: "OTHER1", aircraftType: null },
      }),
      entry("older", "watchlist", "2026-10-07T10:04:59Z"),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.aircraftIcao)).toEqual(["48AF05", "ABC123", "48AF05"]);
  });
});
