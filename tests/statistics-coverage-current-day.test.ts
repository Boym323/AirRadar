import { describe, expect, it } from "vitest";
import { mergeCurrentDayStats } from "@/lib/statistics-coverage-current-day";

const persistedComplete = {
  date: "2026-09-10",
  maxConcurrentAircraft: 80,
  maxDistanceKm: 300,
  maxDistanceIcaoHex: "AAAAAA",
  maxDistanceRegistration: "OK-AAA",
  maxDistanceBearing: 45,
  maxDistanceAt: "2026-09-10T10:00:00.000Z",
  receiverMessagesCount: 123_000,
  maxGroundSpeedKt: 510,
  maxGroundSpeedIcaoHex: "CCCCCC",
  maxGroundSpeedRegistration: "OK-CCC",
  maxGroundSpeedCallsign: "TEST510",
  maxGroundSpeedAt: "2026-09-10T09:00:00.000Z",
};

describe("coverage intelligence current-day merge", () => {
  it("keeps the larger complete persisted reception while taking the higher concurrent maximum", () => {
    const result = mergeCurrentDayStats({
      date: "2026-09-10",
      currentMaxConcurrentAircraft: 90,
      currentMaxDistanceKm: 250,
      currentReception: {
        date: "2026-09-10",
        distanceKm: 250,
        icaoHex: "BBBBBB",
        registration: "OK-BBB",
        bearing: 90,
        recordedAt: "2026-09-10T11:00:00.000Z",
      },
      persisted: persistedComplete,
    });

    expect(result.maxConcurrentAircraft).toBe(90);
    expect(result.maxDistanceKm).toBe(300);
    expect(result.maxDistanceIcaoHex).toBe("AAAAAA");
    expect(result.maxDistanceBearing).toBe(45);
    expect(result.receiverMessagesCount).toBe(123_000);
    expect(result.maxGroundSpeedKt).toBe(510);
  });

  it("uses a complete RAM reception instead of pairing an incomplete persisted maximum with stale metadata", () => {
    const result = mergeCurrentDayStats({
      date: "2026-09-10",
      currentMaxConcurrentAircraft: 75,
      currentMaxDistanceKm: 250,
      currentReception: {
        date: "2026-09-10",
        distanceKm: 250,
        icaoHex: "BBBBBB",
        registration: null,
        bearing: 120,
        recordedAt: "2026-09-10T11:00:00.000Z",
      },
      persisted: {
        ...persistedComplete,
        maxDistanceKm: 320,
        maxDistanceIcaoHex: null,
        maxDistanceRegistration: null,
        maxDistanceBearing: null,
        maxDistanceAt: null,
      },
    });

    expect(result.maxDistanceKm).toBe(250);
    expect(result.maxDistanceIcaoHex).toBe("BBBBBB");
    expect(result.maxDistanceBearing).toBe(120);
    expect(result.maxDistanceAt).toBe("2026-09-10T11:00:00.000Z");
  });

  it("keeps incomplete raw maxima metadata-free when no complete reception exists", () => {
    const result = mergeCurrentDayStats({
      date: "2026-09-10",
      currentMaxConcurrentAircraft: 0,
      currentMaxDistanceKm: 200,
      currentReception: null,
    });

    expect(result.maxDistanceKm).toBe(200);
    expect(result.maxDistanceIcaoHex).toBeNull();
    expect(result.maxDistanceBearing).toBeNull();
    expect(result.maxDistanceAt).toBeNull();
    expect(result.receiverMessagesCount).toBeNull();
    expect(result.maxGroundSpeedKt).toBeNull();
  });
});