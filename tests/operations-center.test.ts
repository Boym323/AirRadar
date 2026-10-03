import { describe, expect, it } from "vitest";
import type { LogbookSummaryResponse } from "@/lib/aircraft/types";
import {
  attentionOperationsCount,
  liveOperationsHighlights,
  operationsAlertTone,
  operationsEventPriority,
  operationsEventTone,
  recentOperationsEvents,
  recentOperationsTimeline,
  relevantOperationsAirportIcaos,
} from "@/lib/intelligence/operations-center";
import type { FlightEventType, FlightIntelligenceEvent } from "@/lib/intelligence/types";
import type { AlertHistoryEntry } from "@/lib/server/alert-history";

function event(type: FlightEventType, occurredAt: string, key: string = type): FlightIntelligenceEvent {
  return {
    id: key,
    eventKey: key,
    lifecycleKey: key,
    type,
    phase: "CRUISE",
    icaoHex: "49d001",
    flightId: 1,
    callsign: "TEST1",
    registration: "OK-TST",
    occurredAt,
    detectedAt: occurredAt,
    latitude: 49.2,
    longitude: 17.7,
    altitude: 12_000,
    confidence: 0.82,
    confidenceLevel: "high",
    airportIcao: null,
    runway: null,
    sectorId: null,
    evidence: [],
  };
}

function alert(
  type: AlertHistoryEntry["type"],
  detectedAt: string,
  options: Partial<AlertHistoryEntry> = {},
): AlertHistoryEntry {
  return {
    id: `${type}:${detectedAt}`,
    detectedAt,
    type,
    reason: type === "new_aircraft" ? "new"
      : type === "reception_record" ? "record"
      : type.startsWith("emergency") ? "emergency"
      : type === "entered_radius" ? "entered_radius"
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

function logbook(): LogbookSummaryResponse {
  return {
    source: "postgres",
    generatedAt: "2026-10-03T20:00:00Z",
    liveAircraft: 4,
    uniqueAircraftToday: 20,
    newAircraftToday: 1,
    rareAircraftToday: 1,
    returningAircraftToday: 1,
    watchlistedLiveAircraft: 1,
    interestingAircraft: [
      {
        icaoHex: "EMERG1",
        labels: [],
        reasons: ["emergency"],
        flightCount: 2,
        returningGapDays: null,
        isLive: true,
        callsign: "EMERG1",
        registration: null,
        aircraftType: "B738",
        distanceKm: 25,
      },
      {
        icaoHex: "RARE01",
        labels: ["rare"],
        reasons: ["rare"],
        flightCount: 2,
        returningGapDays: null,
        isLive: true,
        callsign: "RARE1",
        registration: null,
        aircraftType: "C17",
        distanceKm: 80,
      },
      {
        icaoHex: "OLD001",
        labels: ["new"],
        reasons: ["new"],
        flightCount: 1,
        returningGapDays: null,
        isLive: false,
        callsign: null,
        registration: "OK-OLD",
        aircraftType: "C172",
        distanceKm: null,
      },
    ],
    todayReceptionRecord: null,
    lifetimeReceptionRecord: null,
  };
}

describe("Operations Center intelligence selection", () => {
  it("keeps attention events above routine movement while preserving recency inside a priority", () => {
    const now = Date.parse("2026-10-03T20:00:00Z");
    const selected = recentOperationsEvents([
      event("TAKEOFF", "2026-10-03T19:59:00Z", "takeoff"),
      event("GO_AROUND", "2026-10-03T19:30:00Z", "go-around"),
      event("HOLDING", "2026-10-03T19:50:00Z", "holding"),
      event("GO_AROUND", "2026-10-03T19:45:00Z", "go-around-newer"),
    ], now);

    expect(selected.map((item) => item.eventKey)).toEqual([
      "go-around-newer",
      "go-around",
      "holding",
      "takeoff",
    ]);
  });

  it("filters stale and implausibly future events from the NOW window", () => {
    const now = Date.parse("2026-10-03T20:00:00Z");
    const selected = recentOperationsEvents([
      event("APPROACH", "2026-10-03T19:00:00Z", "boundary"),
      event("TAKEOFF", "2026-10-03T18:59:59Z", "old"),
      event("LEVEL_OFF", "2026-10-03T20:04:00Z", "clock-skew"),
      event("GO_AROUND", "2026-10-03T20:06:00Z", "future"),
    ], now);

    expect(selected.map((item) => item.eventKey)).toEqual(["boundary", "clock-skew"]);
  });

  it("classifies operational attention separately from movement and context", () => {
    expect(operationsEventTone("GO_AROUND")).toBe("attention");
    expect(operationsEventTone("APPROACH")).toBe("movement");
    expect(operationsEventTone("AIRSPACE_ENTRY")).toBe("context");
    expect(operationsEventPriority("GO_AROUND")).toBeGreaterThan(operationsEventPriority("APPROACH"));
    expect(operationsAlertTone(alert("emergency_7700", "2026-10-03T19:50:00Z"))).toBe("attention");
    expect(operationsAlertTone(alert("reception_record", "2026-10-03T19:50:00Z"))).toBe("record");
  });

  it("merges confirmed alerts ahead of inferred intelligence without duplicating intelligence ledger entries", () => {
    const now = Date.parse("2026-10-03T20:00:00Z");
    const record = alert("reception_record", "2026-10-03T19:50:00Z", {
      record: { scope: "daily", distanceKm: 245, bearing: 280, recordedAt: "2026-10-03T19:50:00Z", previousDistanceKm: 240 },
    });
    const emergency = alert("emergency_7700", "2026-10-03T19:40:00Z", { squawk: "7700" });
    const duplicateIntelligence = alert("intelligence_go_around", "2026-10-03T19:59:00Z", {
      reason: "go_around",
      intelligence: { eventType: "GO_AROUND", confidenceLevel: "high", airportIcao: "LOWW", sectorId: null },
    });

    const selected = recentOperationsTimeline([
      event("GO_AROUND", "2026-10-03T19:55:00Z", "go-around"),
      event("TAKEOFF", "2026-10-03T19:58:00Z", "takeoff"),
    ], [record, emergency, duplicateIntelligence], now);

    expect(selected.map((item) => item.source)).toEqual(["alert", "alert", "intelligence", "intelligence"]);
    expect(selected[0].alert?.type).toBe("emergency_7700");
    expect(selected[1].alert?.type).toBe("reception_record");
    expect(selected.some((item) => item.alert?.type === "intelligence_go_around")).toBe(false);
    expect(attentionOperationsCount(selected)).toBe(2);
  });

  it("deduplicates equivalent emergency alert records in the same minute", () => {
    const now = Date.parse("2026-10-03T20:00:00Z");
    const legacy = alert("emergency_7700", "2026-10-03T19:40:10Z", { squawk: "7700" });
    const v1 = alert("alert_v1", "2026-10-03T19:40:40Z", {
      reason: "alert_v1",
      squawk: "7700",
      alertV1: {
        occurrenceId: "1",
        sourceType: "SQUAWK",
        sourceKey: "7700",
        trigger: "SQUAWK",
        ruleName: "Emergency",
        flightEventId: null,
        flightEventType: null,
        airportIcao: null,
        runway: null,
        geofenceId: null,
        deliveryStatus: "delivered",
      },
    });

    const selected = recentOperationsTimeline([], [legacy, v1], now);
    expect(selected).toHaveLength(1);
    expect(selected[0].alert?.id).toBe(v1.id);
  });

  it("keeps only currently live logbook highlights and ranks operational reasons", () => {
    const selected = liveOperationsHighlights(logbook());
    expect(selected.map((item) => item.icaoHex)).toEqual(["EMERG1", "RARE01"]);
  });

  it("derives at most two unique relevant airport contexts from the ranked timeline", () => {
    const now = Date.parse("2026-10-03T20:00:00Z");
    const loww = { ...event("GO_AROUND", "2026-10-03T19:55:00Z", "loww"), airportIcao: "LOWW" };
    const lkpr = { ...event("APPROACH", "2026-10-03T19:56:00Z", "lkpr"), airportIcao: "LKPR" };
    const duplicateLoww = { ...event("TAKEOFF", "2026-10-03T19:57:00Z", "loww-2"), airportIcao: "loww" };
    const lkmt = { ...event("TAKEOFF", "2026-10-03T19:58:00Z", "lkmt"), airportIcao: "LKMT" };
    const timeline = recentOperationsTimeline([loww, lkpr, duplicateLoww, lkmt], [], now, 10);

    expect(relevantOperationsAirportIcaos(timeline)).toEqual(["LOWW", "LKMT"]);
    expect(relevantOperationsAirportIcaos(timeline, 1)).toEqual(["LOWW"]);
  });

  it("honors the bounded render limit", () => {
    const now = Date.parse("2026-10-03T20:00:00Z");
    const events = Array.from({ length: 12 }, (_, index) =>
      event("AIRSPACE_ENTRY", `2026-10-03T19:${String(59 - index).padStart(2, "0")}:00Z`, `event-${index}`),
    );

    expect(recentOperationsEvents(events, now, 5)).toHaveLength(5);
    expect(recentOperationsTimeline(events, [], now, 5)).toHaveLength(5);
  });
});
