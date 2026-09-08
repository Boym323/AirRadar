import { describe, expect, it } from "vitest";
import { buildReceptionRecords } from "@/lib/server/reception-records";

const today = {
  date: "2026-09-08",
  distanceKm: 410,
  icaoHex: "ABC123",
  registration: "OK-ABC",
  recordedAt: "2026-09-08T12:00:00.000Z",
  bearing: 92,
};

describe("receiver reception records", () => {
  it("merges the live day with complete persisted daily maxima and sorts by distance", () => {
    const result = buildReceptionRecords([
      { date: "2026-09-07", maxDistanceKm: 500, maxDistanceIcaoHex: "def456", maxDistanceRegistration: "N-DEF", maxDistanceAt: new Date("2026-09-07T12:00:00Z"), maxDistanceBearing: 180 },
      { date: "2026-09-06", maxDistanceKm: 600, maxDistanceIcaoHex: "BAD", maxDistanceRegistration: "", maxDistanceAt: new Date("2026-09-06T12:00:00Z"), maxDistanceBearing: 180 },
      { date: "2026-09-05", maxDistanceKm: 450, maxDistanceIcaoHex: "FEDCBA", maxDistanceRegistration: null, maxDistanceAt: new Date("2026-09-05T12:00:00Z"), maxDistanceBearing: 359.9 },
    ], today, "postgres");

    expect(result).toMatchObject({ source: "postgres", historicalRecordCount: 2, today, lifetime: { date: "2026-09-07", distanceKm: 500 } });
    expect(result.top.map((record) => record.distanceKm)).toEqual([500, 450, 410]);
  });

  it("does not manufacture a historical record from a legacy row without bearing", () => {
    const result = buildReceptionRecords([
      { date: "2026-09-07", maxDistanceKm: 900, maxDistanceIcaoHex: "ABC123", maxDistanceRegistration: "OK-ABC", maxDistanceAt: new Date("2026-09-07T12:00:00Z"), maxDistanceBearing: null },
    ], null, "postgres");
    expect(result).toMatchObject({ lifetime: null, top: [], historicalRecordCount: 0 });
  });
});
