import { describe, expect, it } from "vitest";
import { mergeCurrentDayStats } from "@/lib/statistics-coverage-current-day";

describe("current-day coverage without retired S05 reception records", () => {
  it("keeps the greater persisted coverage maximum and live counters", () => {
    const result = mergeCurrentDayStats({
      date: "2026-09-10",
      currentUniqueAircraftCount: 550,
      currentMaxConcurrentAircraft: 90,
      currentMaxDistanceKm: 250,
      persisted: {
        date: "2026-09-10", uniqueAircraftCount: 500,
        maxConcurrentAircraft: 80, maxDistanceKm: 300,
        maxDistanceIcaoHex: "AAAAAA", maxDistanceRegistration: "OK-AAA",
        maxDistanceBearing: 45, maxDistanceAt: "2026-09-10T10:00:00.000Z",
        receiverMessagesCount: 123000,
        maxGroundSpeedKt: 510, maxGroundSpeedIcaoHex: "CCCCCC",
        maxGroundSpeedRegistration: "OK-CCC", maxGroundSpeedCallsign: "TEST510",
        maxGroundSpeedAt: "2026-09-10T09:00:00.000Z",
      },
    });
    expect(result).toMatchObject({
      uniqueAircraftCount: 550, maxConcurrentAircraft: 90, maxDistanceKm: 300,
      receiverMessagesCount: 123000, maxGroundSpeedKt: 510,
      maxDistanceIcaoHex: null, maxDistanceRegistration: null,
      maxDistanceBearing: null, maxDistanceAt: null,
    });
  });

  it("takes a greater current maximum without old aircraft identity", () => {
    const result = mergeCurrentDayStats({
      date: "2026-09-10", currentUniqueAircraftCount: 100,
      currentMaxConcurrentAircraft: 10, currentMaxDistanceKm: 320,
      persisted: {
        date: "2026-09-10", uniqueAircraftCount: 99,
        maxConcurrentAircraft: 8, maxDistanceKm: 200,
        maxDistanceIcaoHex: null, maxDistanceRegistration: null,
        maxDistanceBearing: null, maxDistanceAt: null,
        receiverMessagesCount: null, maxGroundSpeedKt: null,
        maxGroundSpeedIcaoHex: null, maxGroundSpeedRegistration: null,
        maxGroundSpeedCallsign: null, maxGroundSpeedAt: null,
      },
    });
    expect(result.maxDistanceKm).toBe(320);
    expect(result.maxDistanceIcaoHex).toBeNull();
  });

  it("is safe with no persisted data", () => {
    const result = mergeCurrentDayStats({
      date: "2026-09-10", currentUniqueAircraftCount: 0,
      currentMaxConcurrentAircraft: 0, currentMaxDistanceKm: 0,
    });
    expect(result.maxDistanceKm).toBe(0);
    expect(result.maxDistanceAt).toBeNull();
    expect(result.receiverMessagesCount).toBeNull();
  });
});
