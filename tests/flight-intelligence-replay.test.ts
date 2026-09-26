import { describe, expect, it } from "vitest";
import type { HistoryFlightDetail, FlightStoryEvent } from "@/lib/server/history";
import { replayFlightIntelligence, REPLAY_COMPARABLE_EVENT_TYPES } from "@/lib/intelligence/replay";

const start = Date.parse("2026-09-17T12:00:00.000Z");
const holdingPoints = [
  [50.10, 14.30, 0],
  [50.12, 14.30, 45],
  [50.12, 14.34, 90],
  [50.10, 14.34, 135],
  [50.08, 14.30, 180],
  [50.08, 14.26, 225],
  [50.10, 14.26, 270],
  [50.12, 14.30, 315],
  [50.10, 14.30, 0],
] as const;

function storyEvent(type: string, seconds: number): FlightStoryEvent {
  return {
    id: seconds + 1,
    type,
    occurredAt: new Date(start + seconds * 1000).toISOString(),
    latitude: 50.1,
    longitude: 14.3,
    altitude: 4_000,
    confidence: 0.95,
    airportIcao: null,
    runway: null,
    sectorId: null,
    summary: null,
  };
}

function history(events: FlightStoryEvent[] = []): HistoryFlightDetail {
  return {
    flight: {
      id: 42,
      icaoHex: "ABC123",
      callsign: "TEST01",
      registration: "OK-TEST",
      aircraftType: "A320",
      airline: null,
      origin: null,
      destination: null,
      startTime: new Date(start).toISOString(),
      endTime: null,
      lastSeenAt: new Date(start + 240_000).toISOString(),
      maxAltitude: 4_000,
      minDistanceKm: 10,
    },
    positions: holdingPoints.map(([lat, lon, track], index) => ({
      recordedAt: new Date(start + index * 30_000).toISOString(),
      lat,
      lon,
      altitude: 4_000,
      groundSpeed: 180,
      track,
      verticalRate: 0,
    })),
    truncated: false,
    positionSampling: {
      originalPositionCount: holdingPoints.length,
      returnedPositionCount: holdingPoints.length,
      sampled: false,
    },
    events,
  };
}

describe("flight intelligence history replay", () => {
  it("matches a persisted comparable event within the timing tolerance", () => {
    const report = replayFlightIntelligence(history([storyEvent("HOLDING", 210)]));
    expect(report.replayedEvents.map((event) => event.type)).toContain("HOLDING");
    expect(report.matches).toHaveLength(1);
    expect(report.metrics).toEqual({
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 1,
      recall: 1,
    });
  });

  it("does not score events that persisted FlightPosition cannot faithfully reproduce", () => {
    const report = replayFlightIntelligence(history([
      storyEvent("LANDING", 240),
      storyEvent("AIRSPACE_ENTRY", 180),
    ]));
    expect(REPLAY_COMPARABLE_EVENT_TYPES.has("LANDING")).toBe(false);
    expect(REPLAY_COMPARABLE_EVENT_TYPES.has("AIRSPACE_ENTRY")).toBe(false);
    expect(report.persistedComparableEvents).toEqual([]);
    expect(report.unsupportedPersistedEvents.map((event) => event.type)).toEqual(["LANDING", "AIRSPACE_ENTRY"]);
    expect(report.metrics.falseNegatives).toBe(0);
    expect(report.inputQuality.missingSignals).toContain("FlightPosition.onGround");
    expect(report.inputQuality.missingSignals).toContain("FlightPosition.atcAssignment");
  });

  it("reports replay-only detections as false positives", () => {
    const report = replayFlightIntelligence(history());
    expect(report.falsePositives.some((event) => event.type === "HOLDING")).toBe(true);
    expect(report.metrics.truePositives).toBe(0);
    expect(report.metrics.precision).toBe(0);
    expect(report.metrics.recall).toBeNull();
  });

  it("sorts historical positions before replaying them", () => {
    const ordered = history([storyEvent("HOLDING", 210)]);
    const reversed = { ...ordered, positions: [...ordered.positions].reverse() };
    const expected = replayFlightIntelligence(ordered).replayedEvents.map((event) => [event.type, event.occurredAt]);
    const actual = replayFlightIntelligence(reversed).replayedEvents.map((event) => [event.type, event.occurredAt]);
    expect(actual).toEqual(expected);
  });
});
