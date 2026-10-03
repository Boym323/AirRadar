import { describe, expect, it } from "vitest";
import { buildDailyIntelligence } from "@/lib/recap/daily-intelligence";
import type { AlertHistoryEntry } from "@/lib/server/alert-history";

function alert(
  type: AlertHistoryEntry["type"],
  detectedAt: string,
  options: Partial<AlertHistoryEntry> = {},
): AlertHistoryEntry {
  return {
    id: `${type}:${detectedAt}`,
    detectedAt,
    type,
    reason: type === "reception_record" ? "record"
      : type === "new_aircraft" ? "new"
      : type.startsWith("emergency") ? "emergency"
      : "watchlisted",
    aircraft: {
      icaoHex: "49D001",
      registration: "OK-TST",
      callsign: "TEST1",
      aircraftType: "A320",
    },
    ruleIds: [],
    ruleNames: [],
    radiusKm: null,
    squawk: null,
    record: null,
    notificationStatus: "delivered",
    notificationAttemptedAt: detectedAt,
    intelligence: null,
    ...options,
  };
}

describe("Daily Intelligence composer", () => {
  it("derives busiest local hour, top airlines and exact persisted event counts", () => {
    const result = buildDailyIntelligence({
      flights: [
        { startedAt: new Date("2026-10-03T08:05:00Z"), airline: "CSA" },
        { startedAt: new Date("2026-10-03T08:25:00Z"), airline: "csa" },
        { startedAt: new Date("2026-10-03T09:05:00Z"), airline: "RYR" },
        { startedAt: new Date("2026-10-03T10:05:00Z"), airline: null },
      ],
      eventAggregates: [
        { type: "GO_AROUND", count: 3 },
        { type: "HOLDING", count: 4 },
        { type: "DIVERSION", count: 1 },
      ],
      events: [],
      alerts: [],
      timezone: "Europe/Prague",
      complete: true,
    });

    expect(result.busiestHour).toEqual({ hour: 10, flights: 2 });
    expect(result.topAirlines).toEqual([
      { name: "CSA", count: 2 },
      { name: "RYR", count: 1 },
    ]);
    expect(result.eventCounts).toEqual({
      goArounds: 3,
      holdings: 4,
      diversions: 1,
      emergencies: 0,
    });
    expect(result.complete).toBe(true);
  });

  it("deduplicates legacy and V1 squawk occurrences in the same minute", () => {
    const legacy = alert("emergency_7700", "2026-10-03T10:15:10Z", { squawk: "7700" });
    const v1 = alert("alert_v1", "2026-10-03T10:15:40Z", {
      reason: "alert_v1",
      squawk: "7700",
      alertV1: {
        occurrenceId: "1",
        sourceType: "SQUAWK",
        sourceKey: "7700",
        trigger: "SQUAWK",
        ruleName: "Emergency squawk",
        flightEventId: null,
        flightEventType: null,
        airportIcao: null,
        runway: null,
        geofenceId: null,
        deliveryStatus: "delivered",
      },
    });

    const result = buildDailyIntelligence({
      flights: [],
      eventAggregates: [],
      events: [],
      alerts: [legacy, v1],
      timezone: "Europe/Prague",
      complete: true,
    });

    expect(result.eventCounts.emergencies).toBe(1);
    expect(result.highlights).toHaveLength(1);
    expect(result.highlights[0]).toMatchObject({
      kind: "emergency",
      squawk: "7700",
      icaoHex: "49D001",
    });
  });

  it("keeps high-value events in the bounded daily highlights and excludes duplicated Flight Intelligence ledger alerts", () => {
    const routine = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      eventKey: `takeoff-${index}`,
      type: "TAKEOFF",
      icaoHex: `49D${String(index).padStart(3, "0")}`,
      occurredAt: new Date(`2026-10-03T1${index % 8}:00:00Z`),
      confidence: 0.85,
      airportIcao: "LKPR",
      runway: "24",
    }));
    const goAround = {
      id: 99,
      eventKey: "go-around",
      type: "GO_AROUND",
      icaoHex: "49DAAA",
      occurredAt: new Date("2026-10-03T08:00:00Z"),
      confidence: 0.92,
      airportIcao: "LOWW",
      runway: "29",
    };
    const record = alert("reception_record", "2026-10-03T11:30:00Z", {
      record: {
        scope: "daily",
        distanceKm: 287,
        bearing: 275,
        recordedAt: "2026-10-03T11:30:00Z",
        previousDistanceKm: 281,
      },
    });
    const duplicatedIntelligence = alert("intelligence_go_around", "2026-10-03T11:45:00Z", {
      reason: "go_around",
      intelligence: {
        eventType: "GO_AROUND",
        confidenceLevel: "high",
        airportIcao: "LOWW",
        sectorId: null,
      },
    });

    const result = buildDailyIntelligence({
      flights: [],
      eventAggregates: [{ type: "GO_AROUND", count: 1 }],
      events: [...routine, goAround],
      alerts: [record, duplicatedIntelligence],
      timezone: "Europe/Prague",
      complete: false,
    });

    expect(result.highlights).toHaveLength(10);
    expect(result.highlights.some((item) => item.eventType === "GO_AROUND")).toBe(true);
    expect(result.highlights.some((item) => item.kind === "reception_record" && item.distanceKm === 287)).toBe(true);
    expect(result.highlights.every((item) => item.key !== `alert:${duplicatedIntelligence.id}`)).toBe(true);
    expect(result.complete).toBe(false);
  });
});
