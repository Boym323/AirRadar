import { describe, expect, it } from "vitest";
import {
  attentionOperationsCount,
  operationsEventPriority,
  operationsEventTone,
  recentOperationsEvents,
} from "@/lib/intelligence/operations-center";
import type { FlightEventType, FlightIntelligenceEvent } from "@/lib/intelligence/types";

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
    expect(attentionOperationsCount([
      event("GO_AROUND", "2026-10-03T19:50:00Z"),
      event("HOLDING", "2026-10-03T19:51:00Z"),
      event("TAKEOFF", "2026-10-03T19:52:00Z"),
    ])).toBe(2);
  });

  it("honors the bounded render limit", () => {
    const now = Date.parse("2026-10-03T20:00:00Z");
    const events = Array.from({ length: 12 }, (_, index) =>
      event("AIRSPACE_ENTRY", `2026-10-03T19:${String(59 - index).padStart(2, "0")}:00Z`, `event-${index}`),
    );

    expect(recentOperationsEvents(events, now, 5)).toHaveLength(5);
  });
});
