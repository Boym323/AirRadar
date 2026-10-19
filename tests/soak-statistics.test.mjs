import { describe, expect, it } from "vitest";
import { stats } from "../scripts/soak-statistics.mjs";

describe("read-only soak statistics", () => {
  it("preserves three-decimal nearest-rank summary used by T57", () => {
    expect(stats([5, 1, 3, 2, 4])).toEqual({
      count: 5, min: 1, p50: 3, p95: 5, max: 5, mean: 3,
    });
  });

  it("ignores null and non-finite values without altering input", () => {
    const values = [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 1, 2, 3];
    expect(stats(values)).toEqual({
      count: 3, min: 1, p50: 2, p95: 3, max: 3, mean: 2,
    });
    expect(values.length).toBe(7);
  });

  it("returns null for a sample without finite values", () => {
    expect(stats([null, Number.NaN, undefined])).toBeNull();
    expect(stats([])).toBeNull();
  });
});
