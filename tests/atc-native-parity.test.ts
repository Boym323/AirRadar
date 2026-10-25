import { describe, expect, it } from "vitest";
import { pointInPolygon, type LonLat } from "@/lib/atc-context/geometry";
import { matchAtcRing } from "@/lib/server/atc-native-geometry";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

// Also run in the ordinary TS-only suite: opt-in false must keep the reference.
const nativeEnabled = process.env.AIRRADAR_NATIVE_ATC === "1"
  && process.env.AIRRADAR_NATIVE_BEAST === "1";

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

describe("optional Rust ATC geometry", () => {
  it("preserves the reference result for mutable and immutable rings", () => {
    const ring: LonLat[] = [[14, 50], [15, 50], [15, 51], [14, 51], [14, 50]];
    for (const point of [[14.5, 50.5], [14, 50.5], [14, 50], [16, 51], [14.2, 50.2]] as LonLat[]) {
      expect(matchAtcRing(point, ring)).toBe(pointInPolygon(point, [ring]));
    }
    // Mutable rings cannot be cached across edits.
    ring[0]![0] = 12;
    expect(matchAtcRing([14, 50], ring)).toBe(pointInPolygon([14, 50], [ring]));
    const frozen: LonLat[] = [[10, 10], [11, 10], [11, 11], [10, 11]];
    frozen.forEach(Object.freeze); Object.freeze(frozen);
    for (const point of [[10.5, 10.5], [10, 10], [9, 10]] as LonLat[]) {
      expect(matchAtcRing(point, frozen)).toBe(pointInPolygon(point, [frozen]));
    }
  });

  it.skipIf(!nativeEnabled)("loads a Rust addon that includes the new ATC symbol", () => {
    expect(getNativeBeastEngine()?.atcRingContains).toEqual(expect.any(Function));
  });

  it.skipIf(!nativeEnabled)("matches 5,000 seeded polygon lookups in the Rust path", () => {
    const rng = seeded(0x5ea7a7);
    const ring: LonLat[] = [];
    for (let i = 0; i < 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2;
      const radius = 0.5 + rng() * 0.5;
      ring.push([14 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius]);
    }
    for (const vertex of ring) Object.freeze(vertex);
    Object.freeze(ring);
    for (let i = 0; i < 5000; i += 1) {
      const point: LonLat = [13 + rng() * 2, 49 + rng() * 2];
      expect(matchAtcRing(point, ring)).toBe(pointInPolygon(point, [ring]));
    }
    // Invalid coordinates are safely handled by the reference.
    expect(matchAtcRing([Number.NaN, 50], ring)).toBe(pointInPolygon([Number.NaN, 50], [ring]));
  });
});
