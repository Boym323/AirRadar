import { describe, expect, it } from "vitest";
import { buildReceiverCoverageIntelligenceV1 } from "@/lib/receiver-coverage-intelligence-v1";

const coverageForDay = (date: string, distance: number, sectors = 36) =>
  Array.from({ length: sectors }, (_, azimuthBucket) => ({ date, azimuthBucket, maxDistanceKm: distance + azimuthBucket / 10 }));

describe("Receiver Coverage Intelligence V1", () => {
  it("builds a bounded current-day plus completed-day trend", () => {
    const result = buildReceiverCoverageIntelligenceV1({
      currentDate: "2026-10-04",
      statsRows: [
        { date: "2026-10-02", uniqueAircraftCount: 510, maxDistanceKm: 270, receiverMessagesCount: 800_000 },
        { date: "2026-10-03", uniqueAircraftCount: 530, maxDistanceKm: 280, receiverMessagesCount: 830_000 },
        { date: "2026-10-04", uniqueAircraftCount: 210, maxDistanceKm: 245, receiverMessagesCount: 320_000 },
      ],
      coverageRows: [
        ...coverageForDay("2026-10-02", 210),
        ...coverageForDay("2026-10-03", 215),
        ...coverageForDay("2026-10-04", 205, 22),
      ],
    });

    expect(result.version).toBe("receiver-coverage-intelligence-v1");
    expect(result.trend.currentDay).toMatchObject({ date: "2026-10-04", complete: false, uniqueAircraft: 210, populatedSectors: 22 });
    expect(result.trend.recentDays.map((point) => point.date)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("fails health closed to insufficient evidence without three baseline days", () => {
    const result = buildReceiverCoverageIntelligenceV1({
      currentDate: "2026-10-04",
      statsRows: [
        { date: "2026-10-01", uniqueAircraftCount: 500, maxDistanceKm: 270, receiverMessagesCount: 800_000 },
        { date: "2026-10-02", uniqueAircraftCount: 510, maxDistanceKm: 272, receiverMessagesCount: 810_000 },
        { date: "2026-10-03", uniqueAircraftCount: 520, maxDistanceKm: 275, receiverMessagesCount: 820_000 },
      ],
      coverageRows: [
        ...coverageForDay("2026-10-01", 210),
        ...coverageForDay("2026-10-02", 212),
        ...coverageForDay("2026-10-03", 214),
      ],
    });

    expect(result.health).toMatchObject({
      state: "INSUFFICIENT_DATA",
      evaluatedDate: "2026-10-03",
      baselineDays: 2,
      reasons: ["coverage.baseline_insufficient"],
    });
  });

  it("marks stable completed-day evidence GOOD", () => {
    const dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
    const result = buildReceiverCoverageIntelligenceV1({
      currentDate: "2026-10-04",
      statsRows: dates.map((date, index) => ({
        date,
        uniqueAircraftCount: 500 + index * 5,
        maxDistanceKm: 270 + index,
        receiverMessagesCount: 800_000 + index * 5_000,
      })),
      coverageRows: dates.flatMap((date, index) => coverageForDay(date, 205 + index)),
    });

    expect(result.health.state).toBe("GOOD");
    expect(result.health.evaluatedDate).toBe("2026-10-03");
    expect(result.health.baselineDays).toBe(5);
    expect(result.health.reasons).toEqual([]);
  });

  it("marks corroborated range and sector collapse DEGRADED", () => {
    const baselineDates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];
    const result = buildReceiverCoverageIntelligenceV1({
      currentDate: "2026-10-04",
      statsRows: [
        ...baselineDates.map((date) => ({ date, uniqueAircraftCount: 500, maxDistanceKm: 280, receiverMessagesCount: 800_000 })),
        { date: "2026-10-03", uniqueAircraftCount: 230, maxDistanceKm: 155, receiverMessagesCount: 350_000 },
      ],
      coverageRows: [
        ...baselineDates.flatMap((date) => coverageForDay(date, 210)),
        ...coverageForDay("2026-10-03", 125, 18),
      ],
    });

    expect(result.health.state).toBe("DEGRADED");
    expect(result.health.rangeRatio).toBeLessThan(0.75);
    expect(result.health.sectorRatio).toBeLessThan(0.75);
    expect(result.health.reasons).toContain("coverage.range_below_baseline");
    expect(result.health.reasons).toContain("coverage.sectors_below_baseline");
  });

  it("does not treat traffic volume alone as receiver degradation", () => {
    const dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];
    const result = buildReceiverCoverageIntelligenceV1({
      currentDate: "2026-10-04",
      statsRows: [
        ...dates.map((date) => ({ date, uniqueAircraftCount: 500, maxDistanceKm: 280, receiverMessagesCount: 800_000 })),
        { date: "2026-10-03", uniqueAircraftCount: 120, maxDistanceKm: 275, receiverMessagesCount: 790_000 },
      ],
      coverageRows: [
        ...dates.flatMap((date) => coverageForDay(date, 210)),
        ...coverageForDay("2026-10-03", 208),
      ],
    });

    expect(result.health.state).toBe("GOOD");
    expect(result.health.reasons).toContain("coverage.unique_aircraft_below_baseline");
  });
});
  it("supports an explicit bounded 30-day trend without changing the default", () => {
    const dates = Array.from({ length: 30 }, (_, index) => "2026-09-" + String(index + 1).padStart(2, "0"));
    const result = buildReceiverCoverageIntelligenceV1({
      currentDate: "2026-09-30",
      historyDays: 30,
      statsRows: dates.map((date) => ({
        date,
        uniqueAircraftCount: 400,
        maxDistanceKm: 250,
        receiverMessagesCount: 700_000,
      })),
      coverageRows: dates.flatMap((date) => coverageForDay(date, 200)),
    });

    expect(result.trend.recentDays).toHaveLength(30);
    expect(result.trend.recentDays[0]?.date).toBe("2026-09-01");
    expect(result.trend.recentDays.at(-1)?.date).toBe("2026-09-30");
  });


