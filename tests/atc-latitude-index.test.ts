import { describe, expect, it } from "vitest";
import { pointInPolygon, type LonLat } from "@/lib/atc-context/geometry";
import { prewarmFrozenAtcRing } from "@/lib/atc-context/latitude-ring-index";

function denseRectangle(): LonLat[] {
  const ring: LonLat[] = [];
  for (let i = 0; i <= 1200; i++) ring.push([14 + i / 1200, 49]);
  for (let i = 1; i <= 1200; i++) ring.push([15, 49 + i / 1200]);
  for (let i = 1; i <= 1200; i++) ring.push([15 - i / 1200, 50]);
  for (let i = 1; i <= 1200; i++) ring.push([14, 50 - i / 1200]);
  return ring;
}

describe("V1 immutable ATC scanline index parity", () => {
  it("preserves inside/boundary/outside and holes for thousands of edges", async () => {
    const input = denseRectangle();
    const queries: LonLat[] = [[14.5, 49.5], [14, 49.5], [15, 50],
      [13.5, 49.5], [14.5, 50.0000001], [14.0000000001, 49.5]];
    let state = 0x91a2b3c4;
    for (let i = 0; i < 600; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const lon = 13.8 + (state / 0x100000000) * 1.4;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const lat = 48.8 + (state / 0x100000000) * 1.4;
      queries.push([lon, lat]);
    }
    const original = queries.map((point) => pointInPolygon(point, [input]));
    const frozen = Object.freeze(input.map((point) => Object.freeze([...point] as LonLat))) as unknown as LonLat[];
    expect(await prewarmFrozenAtcRing(frozen)).toBe(true);
    expect(queries.map((point) => pointInPolygon(point, [frozen]))).toEqual(original);

    const hole: LonLat[] = [[14.2, 49.2], [14.8, 49.2], [14.8, 49.8], [14.2, 49.8], [14.2, 49.2]];
    expect(pointInPolygon([14.5, 49.5], [frozen, hole])).toBeNull();
    expect(pointInPolygon([14.2, 49.5], [frozen, hole])).toBe("boundary");
  });

  it("does not cache mutable rings even if only a middle vertex changes", async () => {
    const ring = denseRectangle();
    expect(await prewarmFrozenAtcRing(ring)).toBe(false);
    const before = pointInPolygon([14.5, 49.5], [ring]);
    ring[900]![1] = 50.5;
    expect(pointInPolygon([14.5, 49.5], [ring])).toBe(
      pointInPolygon([14.5, 49.5], [ring.map((point) => [...point] as LonLat)]),
    );
    expect(before).toBe("inside");
  });

  it("skips shallow-frozen rings with mutable interior coordinates", async () => {
    const ring = denseRectangle();
    Object.freeze(ring);
    expect(await prewarmFrozenAtcRing(ring)).toBe(false);
    ring[1300]![1] += 0.5;
    expect(pointInPolygon([15.01, 49.5], [ring])).toBe(
      pointInPolygon([15.01, 49.5], [[...ring] as LonLat[]]),
    );
  });
});
