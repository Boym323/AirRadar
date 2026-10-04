import { describe, expect, it } from "vitest";
import {
  buildFlightStoryNarrative,
  buildFlightStoryV2Summary,
} from "@/lib/flight-story/narrative";
import type { HistoryFlightDetail } from "@/lib/server/history";

function detail(): HistoryFlightDetail {
  return {
    flight: {
      id: 42,
      icaoHex: "49D001",
      callsign: "CSA123",
      registration: "OK-TST",
      aircraftType: "A320",
      airline: "CSA",
      origin: "LKPR",
      destination: "LOWW",
      startTime: "2026-10-03T10:00:00.000Z",
      endTime: "2026-10-03T10:30:00.000Z",
      lastSeenAt: "2026-10-03T10:30:00.000Z",
      maxAltitude: 35_000,
      minDistanceKm: 12.5,
    },
    positions: [
      {
        recordedAt: "2026-10-03T10:00:05.000Z",
        lat: 49,
        lon: 17,
        altitude: 2_000,
        groundSpeed: 160,
        track: 90,
        verticalRate: 1_800,
      },
      {
        recordedAt: "2026-10-03T10:10:00.000Z",
        lat: 49,
        lon: 17.1,
        altitude: 18_000,
        groundSpeed: 410,
        track: 95,
        verticalRate: 1_200,
      },
      {
        recordedAt: "2026-10-03T10:20:00.000Z",
        lat: 49.05,
        lon: 17.2,
        altitude: 14_000,
        groundSpeed: 360,
        track: 110,
        verticalRate: -1_400,
      },
      {
        recordedAt: "2026-10-03T10:29:55.000Z",
        lat: 49.1,
        lon: 17.25,
        altitude: 3_000,
        groundSpeed: 145,
        track: 120,
        verticalRate: -700,
      },
    ],
    truncated: false,
    positionSampling: {
      originalPositionCount: 4,
      returnedPositionCount: 4,
      sampled: false,
    },
    events: [
      {
        id: 11,
        type: "GO_AROUND",
        occurredAt: "2026-10-03T10:20:08.000Z",
        latitude: 49.05,
        longitude: 17.2,
        altitude: 14_200,
        confidence: 0.91,
        airportIcao: "LOWW",
        runway: "29",
        sectorId: null,
        summary: "LOWW · 29",
      },
      {
        id: 12,
        type: "HOLDING",
        occurredAt: "2026-10-03T10:12:00.000Z",
        latitude: 49.01,
        longitude: 17.12,
        altitude: 18_000,
        confidence: 0.72,
        airportIcao: null,
        runway: null,
        sectorId: "VIENNA",
        summary: "VIENNA",
      },
      {
        id: 13,
        type: "GO_AROUND",
        occurredAt: "2026-10-03T10:24:00.000Z",
        latitude: 49.08,
        longitude: 17.23,
        altitude: 8_000,
        confidence: 0.58,
        airportIcao: "LOWW",
        runway: "29",
        sectorId: null,
        summary: "LOWW · 29",
      },
    ],
  };
}

describe("Flight Story V2 narrative composer", () => {
  it("builds deterministic observed-flight summary metrics", () => {
    const summary = buildFlightStoryV2Summary(detail());

    expect(summary.observedStartAt).toBe("2026-10-03T10:00:00.000Z");
    expect(summary.observedEndAt).toBe("2026-10-03T10:30:00.000Z");
    expect(summary.observedDurationMs).toBe(30 * 60_000);
    expect(summary.maxGroundSpeedKt).toBe(410);
    expect(summary.sampledPathDistanceKm).toBeGreaterThan(15);
    expect(summary.sampledPathDistanceKm).toBeLessThan(30);
    expect(summary.eventCount).toBe(3);
    expect(summary.attentionEventCount).toBe(3);
    expect(summary.badges).toEqual(["GO_AROUND", "HOLDING"]);
  });

  it("marks boundaries observed and Flight Intelligence events inferred", () => {
    const narrative = buildFlightStoryNarrative(detail());

    expect(narrative[0]).toMatchObject({
      key: "boundary:first-seen",
      boundary: "first_seen",
      provenance: "observed",
      occurredAt: "2026-10-03T10:00:00.000Z",
    });
    expect(narrative.at(-1)).toMatchObject({
      key: "boundary:last-seen",
      boundary: "last_seen",
      provenance: "observed",
      occurredAt: "2026-10-03T10:30:00.000Z",
    });
    expect(narrative.find((item) => item.eventId === 11)).toMatchObject({
      type: "GO_AROUND",
      provenance: "inferred",
      confidenceLevel: "high",
      airportIcao: "LOWW",
      runway: "29",
      telemetry: {
        altitude: 14_200,
        groundSpeed: 360,
        verticalRate: -1_400,
        track: 110,
      },
    });
    expect(narrative.find((item) => item.eventId === 12)?.confidenceLevel).toBe("medium");
    expect(narrative.find((item) => item.eventId === 13)?.confidenceLevel).toBe("low");
  });

  it("falls back to event altitude when no nearby telemetry sample exists", () => {
    const input = detail();
    input.events = [{
      ...input.events[0]!,
      id: 50,
      occurredAt: "2026-10-03T11:00:00.000Z",
      altitude: 9_500,
    }];

    const event = buildFlightStoryNarrative(input).find((item) => item.eventId === 50);
    expect(event?.telemetry).toEqual({
      altitude: 9_500,
      groundSpeed: null,
      verticalRate: null,
      track: null,
    });
  });

  it("preserves the sampled-position disclosure from the existing bounded payload", () => {
    const input = detail();
    input.positionSampling = {
      originalPositionCount: 9_000,
      returnedPositionCount: 2_000,
      sampled: true,
    };

    expect(buildFlightStoryV2Summary(input).sampled).toBe(true);
  });
});
