import { describe, expect, it } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import type { Aircraft, ReceiverPosition } from "@/lib/aircraft/types";
import {
  altitudeCoverageBand,
  MAX_PLAUSIBLE_GROUND_SPEED_KT,
  MIN_PLAUSIBLE_GROUND_SPEED_KT,
  plausibleGroundSpeedKt,
  ReceiverAdvancedStatistics,
} from "@/lib/server/receiver-advanced-statistics";

const receiver: ReceiverPosition = { lat: 50, lon: 14, name: "Test" };

function aircraft(options: {
  hex?: string;
  altitude?: number;
  groundSpeed?: number;
  distanceKm?: number;
  bearing?: number;
  onGround?: boolean;
} = {}): Aircraft {
  const value = normalizeAircraft({
    hex: options.hex ?? "ABC123",
    flight: options.hex ?? "ABC123",
    lat: 50.1,
    lon: 14.1,
    alt_baro: options.altitude ?? 10_000,
    gs: options.groundSpeed ?? 300,
  }, receiver, new Date("2026-09-10T12:00:00.000Z"));
  if (!value) throw new Error("aircraft normalization failed");
  value.distanceKm = options.distanceKm ?? 100;
  value.bearing = options.bearing ?? 45;
  value.onGround = options.onGround ?? false;
  return value;
}

describe("receiver advanced statistics", () => {
  it("uses stable altitude-band boundaries", () => {
    expect(altitudeCoverageBand(null)).toBeNull();
    expect(altitudeCoverageBand(-1)).toBeNull();
    expect(altitudeCoverageBand(0)).toBe(0);
    expect(altitudeCoverageBand(4_999)).toBe(0);
    expect(altitudeCoverageBand(5_000)).toBe(1);
    expect(altitudeCoverageBand(14_999)).toBe(1);
    expect(altitudeCoverageBand(15_000)).toBe(2);
    expect(altitudeCoverageBand(29_999)).toBe(2);
    expect(altitudeCoverageBand(30_000)).toBe(3);
  });

  it("rejects implausible and ground speed records", () => {
    expect(plausibleGroundSpeedKt(aircraft({ groundSpeed: MIN_PLAUSIBLE_GROUND_SPEED_KT - 1 }))).toBeNull();
    expect(plausibleGroundSpeedKt(aircraft({ groundSpeed: MIN_PLAUSIBLE_GROUND_SPEED_KT }))).toBe(MIN_PLAUSIBLE_GROUND_SPEED_KT);
    expect(plausibleGroundSpeedKt(aircraft({ groundSpeed: MAX_PLAUSIBLE_GROUND_SPEED_KT }))).toBe(MAX_PLAUSIBLE_GROUND_SPEED_KT);
    expect(plausibleGroundSpeedKt(aircraft({ groundSpeed: MAX_PLAUSIBLE_GROUND_SPEED_KT + 1 }))).toBeNull();
    expect(plausibleGroundSpeedKt(aircraft({ groundSpeed: 120, onGround: true }))).toBeNull();
  });

  it("accumulates readsb message deltas and survives a counter reset", async () => {
    const stats = new ReceiverAdvancedStatistics("Europe/Prague");
    const at = new Date("2026-09-10T12:00:00.000Z");
    stats.observe([], 1_000, at);
    await stats.close();
    expect(stats.getSnapshot(at).receiverMessagesCount).toBe(0);

    stats.observe([], 1_075, new Date(at.getTime() + 5_000));
    await stats.close();
    expect(stats.getSnapshot(at).receiverMessagesCount).toBe(75);

    stats.observe([], 20, new Date(at.getTime() + 10_000));
    await stats.close();
    expect(stats.getSnapshot(at)).toMatchObject({ receiverMessagesCount: 95, receiverMessagesRawLast: 20 });
  });

  it("keeps altitude coverage maxima independently per band and sector", async () => {
    const stats = new ReceiverAdvancedStatistics("Europe/Prague");
    const at = new Date("2026-09-10T12:00:00.000Z");
    stats.observe([
      aircraft({ hex: "A00001", altitude: 4_000, bearing: 42, distanceKm: 80 }),
      aircraft({ hex: "B00001", altitude: 10_000, bearing: 42, distanceKm: 140 }),
    ], null, at);
    stats.observe([
      aircraft({ hex: "A00002", altitude: 4_000, bearing: 42, distanceKm: 50 }),
      aircraft({ hex: "A00003", altitude: 4_000, bearing: 55, distanceKm: 90 }),
    ], null, new Date(at.getTime() + 1_000));
    await stats.close();

    const rows = stats.getSnapshot(at).altitudeCoverage;
    expect(rows).toEqual(expect.arrayContaining([
      { azimuthBucket: 4, altitudeBand: 0, maxDistanceKm: 80 },
      { azimuthBucket: 4, altitudeBand: 1, maxDistanceKm: 140 },
      { azimuthBucket: 5, altitudeBand: 0, maxDistanceKm: 90 },
    ]));
  });

  it("keeps only the fastest plausible positioned aircraft", async () => {
    const stats = new ReceiverAdvancedStatistics("Europe/Prague");
    const at = new Date("2026-09-10T12:00:00.000Z");
    stats.observe([
      aircraft({ hex: "FA5701", groundSpeed: 420 }),
      aircraft({ hex: "5A1CE1", groundSpeed: 1_500 }),
      aircraft({ hex: "FA5702", groundSpeed: 510 }),
    ], null, at);
    await stats.close();
    expect(stats.getSnapshot(at).fastest).toMatchObject({ speedKt: 510, icaoHex: "FA5702" });
  });
});
