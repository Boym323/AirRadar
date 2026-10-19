import { describe, expect, it } from "vitest";
import {
  buildReceiverCoverageIntelligence,
  buildReceiverCoverageIntelligenceV1,
  buildReceiverCoverageIntelligenceV2,
} from "@/lib/receiver-coverage-intelligence";

describe("consolidated receiver coverage intelligence", () => {
  it("preserves daily RF range and rolling capture computations", () => {
    const daily = {
      currentDate: "2026-10-19",
      statsRows: [{ date: "2026-10-18", uniqueAircraftCount: 88, maxDistanceKm: 225, receiverMessagesCount: 150_000 }],
      coverageRows: [{ date: "2026-10-18", azimuthBucket: 12, maxDistanceKm: 225 }],
    };
    const rolling = {
      now: new Date("2026-10-19T06:00:00.000Z"),
      rows: [
        { hour: "2026-10-19T01:00:00.000Z", dimension: "overall", bucketKey: "overall", availableCount: 140, capturedCount: 112 },
        { hour: "2026-10-15T01:00:00.000Z", dimension: "overall", bucketKey: "overall", availableCount: 900, capturedCount: 720 },
        { hour: "2026-10-19T01:00:00.000Z", dimension: "azimuth", bucketKey: "azimuth:12", availableCount: 60, capturedCount: 50 },
      ],
    };
    const result = buildReceiverCoverageIntelligence({ daily, rolling });
    expect(result.daily).toEqual(buildReceiverCoverageIntelligenceV1(daily));
    expect(result.rolling).toEqual(buildReceiverCoverageIntelligenceV2(rolling));
    expect(result.daily.version).toBe("receiver-coverage-intelligence-v1");
    expect(result.rolling.version).toBe("receiver-coverage-intelligence-v2");
    expect(result.daily.trend.recentDays).toHaveLength(1);
    expect(result.rolling.hourly).toHaveLength(1);
    expect(result.rolling.sectors).toHaveLength(36);
  });
});
