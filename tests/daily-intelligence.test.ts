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
        { type: "UNUSUAL_TURN", count: 2 },
        { type: "ORBIT", count: 1 },
      ],
      routeAggregates: [
        { origin: "LKPR", destination: "EGLL", count: 4 },
        { origin: "LOWW", destination: "LKPR", count: 3 },
        { origin: "LKPR", destination: "LOWW", count: 2 },
      ],
      events: [],
      weather: [
        { id: 1, aircraftHex: "49D001", callsign: "TEST1", observedAt: new Date("2026-10-03T10:10:00Z"), altitudeFt: 22000, windDirectionDeg: 270, windSpeedKt: 45, turbulenceLevel: 2, quality: "HIGH", source: "BDS_4_4" },
        { id: 2, aircraftHex: "49D002", callsign: "TEST2", observedAt: new Date("2026-10-03T11:10:00Z"), altitudeFt: 30000, windDirectionDeg: 250, windSpeedKt: 70, turbulenceLevel: null, quality: "GOOD", source: "READSB_JSON" },
        { id: 3, aircraftHex: "49D003", callsign: "TEST3", observedAt: new Date("2026-10-03T11:20:00Z"), altitudeFt: 31000, windDirectionDeg: 250, windSpeedKt: 90, turbulenceLevel: null, quality: "LOW", source: "READSB_JSON" },
      ],
      weatherStatus: "available",
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
      unusualTurns: 2,
      orbits: 1,
    });
    expect(result.topAirports[0]).toEqual({ icao: "LKPR", movements: 9, arrivals: 3, departures: 6 });
    expect(result.weatherHighlights).toEqual([
      expect.objectContaining({ kind: "turbulence", icaoHex: "49D001", turbulenceLevel: 2, quality: "HIGH" }),
      expect.objectContaining({ kind: "strong_wind", icaoHex: "49D002", windSpeedKt: 70, quality: "GOOD" }),
    ]);
    expect(result.weatherStatus).toBe("available");
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
      routeAggregates: [],
      events: [],
      weather: [],
      weatherStatus: "available",
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

  it("does not classify arbitrary V1 squawk rules as emergency events", () => {
    const routineSquawk = alert("alert_v1", "2026-10-03T10:20:00Z", {
      reason: "alert_v1",
      squawk: "1200",
      alertV1: {
        occurrenceId: "2",
        sourceType: "SQUAWK",
        sourceKey: "1200",
        trigger: "SQUAWK",
        ruleName: "Custom squawk",
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
      routeAggregates: [],
      events: [],
      weather: [],
      weatherStatus: "available",
      alerts: [routineSquawk],
      timezone: "Europe/Prague",
      complete: true,
    });

    expect(result.eventCounts.emergencies).toBe(0);
    expect(result.highlights).toHaveLength(0);
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
      routeAggregates: [],
      events: [...routine, goAround],
      weather: [],
      weatherStatus: "unavailable",
      alerts: [record, duplicatedIntelligence],
      timezone: "Europe/Prague",
      complete: false,
    });

    expect(result.highlights).toHaveLength(10);
    expect(result.highlights.some((item) => item.eventType === "GO_AROUND")).toBe(true);
    expect(result.highlights.some((item) => item.kind === "reception_record" && item.distanceKm === 287)).toBe(true);
    expect(result.highlights.every((item) => item.key !== `alert:${duplicatedIntelligence.id}`)).toBe(true);
    expect(result.weatherStatus).toBe("unavailable");
    expect(result.complete).toBe(false);
  });

  it("deduplicates weather highlights per aircraft and keeps the strongest accepted signal", () => {
    const result = buildDailyIntelligence({
      flights: [],
      eventAggregates: [],
      routeAggregates: [],
      events: [],
      weather: [
        { id: 10, aircraftHex: "49DAAA", callsign: "WX1", observedAt: new Date("2026-10-03T09:00:00Z"), altitudeFt: 18000, windDirectionDeg: 210, windSpeedKt: 55, turbulenceLevel: null, quality: "GOOD", source: "READSB_JSON" },
        { id: 11, aircraftHex: "49DAAA", callsign: "WX1", observedAt: new Date("2026-10-03T09:05:00Z"), altitudeFt: 18500, windDirectionDeg: 220, windSpeedKt: 40, turbulenceLevel: 3, quality: "HIGH", source: "BDS_4_4" },
        { id: 12, aircraftHex: "49DBBB", callsign: "WX2", observedAt: new Date("2026-10-03T09:10:00Z"), altitudeFt: 19000, windDirectionDeg: 230, windSpeedKt: 80, turbulenceLevel: null, quality: "REJECTED", source: "BDS_4_4" },
      ],
      weatherStatus: "truncated",
      alerts: [],
      timezone: "Europe/Prague",
      complete: false,
    });

    expect(result.weatherHighlights).toHaveLength(1);
    expect(result.weatherHighlights[0]).toMatchObject({
      key: "weather:11",
      kind: "turbulence",
      icaoHex: "49DAAA",
      turbulenceLevel: 3,
      quality: "HIGH",
    });
    expect(result.weatherStatus).toBe("truncated");
  });
});
