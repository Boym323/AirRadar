import { describe, expect, it } from "vitest";
import { buildReceiverMonitoring } from "@/lib/server/receiver-monitoring";
import type { ReceiverQuality } from "@/lib/server/receiver-quality";

const now = new Date("2026-10-06T10:00:00.000Z");
function quality(overrides: Partial<ReceiverQuality> = {}): ReceiverQuality {
  return {
    state: "GOOD",
    aircraftCount: 12,
    messagesPerSecond: 8,
    positionsPerSecond: 1,
    latestMessageAgeSeconds: 2,
    latestPositionAgeSeconds: 5,
    maxRangeNm: 120,
    positionQuality: { freshPositions: 12, stalePositions: 0, medianPositionAgeSeconds: 5, p90PositionAgeSeconds: 10 },
    ...overrides,
  };
}

describe("receiver monitoring", () => {
  it("reports healthy live reception", () => {
    expect(buildReceiverMonitoring({ quality: quality(), online: true, sourceStatus: "live", now })).toMatchObject({ state: "HEALTHY", recommendedAction: "NONE", causes: [] });
  });

  it("separates feed outage from RF degradation", () => {
    expect(buildReceiverMonitoring({ quality: quality({ state: "OFFLINE", latestMessageAgeSeconds: 240 }), online: false, sourceStatus: "offline", now })).toMatchObject({ state: "OFFLINE", recommendedAction: "CHECK_READSB", causes: [{ code: "SOURCE_UNAVAILABLE", confidence: "HIGH" }] });
    expect(buildReceiverMonitoring({ quality: quality({ aircraftCount: 0, messagesPerSecond: 0 }), online: true, sourceStatus: "live", now })).toMatchObject({ state: "DEGRADED", recommendedAction: "CHECK_ANTENNA_OR_RF", causes: [{ code: "NO_AIRCRAFT" }, { code: "LOW_MESSAGE_RATE" }] });
  });

  it("fails closed for demo data", () => {
    expect(buildReceiverMonitoring({ quality: quality(), online: false, sourceStatus: "demo", now })).toMatchObject({ state: "INSUFFICIENT_DATA", recommendedAction: "NONE", causes: [{ code: "DEMO_SOURCE" }] });
  });
});
