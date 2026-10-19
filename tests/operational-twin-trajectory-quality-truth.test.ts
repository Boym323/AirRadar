import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { finiteAltitude, truthAltitudeAt } from "@/lib/operational-twin/trajectory-quality-truth";

const at = Date.parse("2026-10-19T10:00:00.000Z");
const iso = (offsetMs: number) => new Date(at + offsetMs).toISOString();
const aircraft = (
  changes: Partial<Aircraft> = {},
): Aircraft => ({
  lastSeen: iso(0),
  seenSeconds: 0,
  seenPosSeconds: null,
  baroAltitude: null,
  altitude: null,
  geomAltitude: null,
  trail: [],
  ...changes,
}) as Aircraft;

describe("shared trajectory-quality truth altitude", () => {
  it("selects the closest of the recent trail observations", () => {
    const a = aircraft({ trail: [
      { recordedAt: iso(-9000), altitude: 12300 },
      { recordedAt: iso(2000), altitude: 12400 },
    ] as Aircraft["trail"] });
    expect(truthAltitudeAt(a, at)).toBe(12400);
  });

  it("uses the latest observation when it is closer and prioritizes barometric altitude", () => {
    const a = aircraft({
      lastSeen: iso(1000), seenPosSeconds: 0,
      baroAltitude: 25000, altitude: 24000, geomAltitude: 26000,
      trail: [{ recordedAt: iso(-3000), altitude: 22000 }] as Aircraft["trail"],
    });
    expect(truthAltitudeAt(a, at)).toBe(25000);
  });

  it("accepts the inclusive 20-second tolerance and rejects later samples", () => {
    const a = aircraft({ trail: [{ recordedAt: iso(20000), altitude: 5000 }] as Aircraft["trail"] });
    expect(truthAltitudeAt(a, at)).toBe(5000);
    expect(truthAltitudeAt(a, at - 1)).toBeNull();
  });

  it("never examines older trail samples beyond the last twenty", () => {
    const trail = [
      { recordedAt: iso(0), altitude: 10000 },
      ...Array.from({ length: 20 }, (_, i) => ({ recordedAt: iso(30000 + i * 1000), altitude: 11000 })),
    ] as Aircraft["trail"];
    expect(truthAltitudeAt(aircraft({ trail }), at)).toBeNull();
  });

  it("rejects nonfinite measurements and falls back to geometric altitude", () => {
    expect(finiteAltitude(Number.NaN)).toBe(false);
    expect(finiteAltitude(Number.POSITIVE_INFINITY)).toBe(false);
    const a = aircraft({
      lastSeen: iso(0), seenPosSeconds: 0,
      baroAltitude: Number.NaN, altitude: null, geomAltitude: 7500,
      trail: [{ recordedAt: iso(0), altitude: Number.NaN }] as Aircraft["trail"],
    });
    expect(truthAltitudeAt(a, at)).toBe(7500);
  });
});
