import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { aggregateReceiverCoverage, buildReceiverQuality } from "@/lib/server/receiver-quality";

const now = new Date("2026-09-26T12:00:00.000Z");
function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { icaoHex: "ABC123", callsign: "TEST", registration: null, aircraftType: null, aircraftDescription: null, lat: 50, lon: 14, altitude: 10_000, baroAltitude: 10_000, geomAltitude: 10_000, groundSpeed: 200, track: 90, verticalRate: 0, baroRate: 0, geomRate: 0, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 10, lastSeen: now.toISOString(), source: "ADS-B", origin: "local", sourceType: null, onGround: false, distanceKm: 50, bearing: 90, trail: [], ...overrides };
}

describe("receiver quality", () => {
  it("normalizes healthy, stale, offline, and no-aircraft states", () => {
    expect(buildReceiverQuality({ aircraft: [aircraft()], online: true, latestMessageAt: now, now }).state).toBe("GOOD");
    expect(buildReceiverQuality({ aircraft: [aircraft({ seenPosSeconds: 90 })], online: true, latestMessageAt: now, now }).state).toBe("DEGRADED");
    expect(buildReceiverQuality({ aircraft: [], online: false, latestMessageAt: null, now }).state).toBe("OFFLINE");
  });

  it("computes position quality and bounded coverage buckets", () => {
    const rows = [aircraft(), aircraft({ icaoHex: "DEF456", seenPosSeconds: 80, distanceKm: 60, altitude: 15_000 })];
    const quality = buildReceiverQuality({ aircraft: rows, online: true, latestMessageAt: now, now });
    expect(quality.positionQuality).toMatchObject({ freshPositions: 1, stalePositions: 1, medianPositionAgeSeconds: 10, p90PositionAgeSeconds: 10 });
    expect(aggregateReceiverCoverage(rows)).toEqual([
      { azimuthBucket: 90, distanceBucketKm: 50, altitudeBucketFt: 10_000, observationCount: 1 },
      { azimuthBucket: 90, distanceBucketKm: 50, altitudeBucketFt: 15_000, observationCount: 1 },
    ]);
  });

  it("uses only available telemetry for rates and range", () => {
    const result = buildReceiverQuality({ aircraft: [aircraft({ distanceKm: null })], online: true, latestMessageAt: now, messagesPerSecond: 12.5, previousPositionCount: 0, sampleIntervalSeconds: 5, now });
    expect(result).toMatchObject({ messagesPerSecond: 12.5, positionsPerSecond: 0.2, maxRangeNm: null });
  });
});
