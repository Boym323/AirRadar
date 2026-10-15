import { describe, expect, it } from "vitest";
import type { TrailPoint } from "@/lib/aircraft/types";
import { appendBoundedNetworkTrailPoint, appendTrailPoint } from "@/lib/aircraft/trail";

const baseTime = Date.parse("2026-10-15T10:00:00.000Z");

function point(second: number, lon: number, recordedAt?: string): TrailPoint {
  return {
    lat: 50,
    lon,
    recordedAt: recordedAt ?? new Date(baseTime + second * 1_000).toISOString(),
    altitude: 32_000,
    track: 90,
    groundSpeed: 450,
  };
}

/** Exact pre-optimization network trail update; keep this independent. */
function originalUpdate(
  trail: readonly TrailPoint[],
  incoming: TrailPoint | null,
  cutoff: number,
  maxPoints: number,
): TrailPoint[] {
  const next = incoming ? appendTrailPoint(trail, incoming) : trail;
  const filtered = next.filter((item) => {
    const at = Date.parse(item.recordedAt);
    return !Number.isFinite(cutoff) || (Number.isFinite(at) && at >= cutoff);
  });
  return filtered.slice(-maxPoints);
}

describe("incremental bounded network trail", () => {
  it("returns the identical immutable trail when no position or pruning changes", () => {
    const first = appendBoundedNetworkTrailPoint([], point(0, 14), baseTime - 1, 120);
    const again = appendBoundedNetworkTrailPoint(first, null, baseTime - 1, 120);
    expect(again).toBe(first);
    const late = appendBoundedNetworkTrailPoint(again, point(0, 15), baseTime - 1, 120);
    expect(late).toBe(again);
    const expired = appendBoundedNetworkTrailPoint(late, null, baseTime + 1, 120);
    expect(expired).toEqual([]);
    expect(expired).not.toBe(late);
  });

  it("matches the original implementation over long mixed updates and window slides", () => {
    let optimized: TrailPoint[] = [];
    let reference: TrailPoint[] = [];
    for (let index = 0; index < 1_800; index += 1) {
      const mode = index % 17;
      let incoming: TrailPoint | null;
      if (mode === 0) incoming = null;
      else if (mode === 1) incoming = point(index - 4, 14 + index / 1_000_000);
      else if (mode === 2) incoming = point(index, 130); // impossible jump
      else if (mode === 3) incoming = point(index, 14, "invalid"); // malformed timestamp
      else if (mode === 4 && optimized.length) incoming = {
        ...optimized[optimized.length - 1]!,
        recordedAt: new Date(baseTime + index * 1000).toISOString(),
      }; // same-position endpoint replacement
      else incoming = point(index, 14 + index / 1_000_000);
      const cutoff = mode === 5 ? Number.NaN : baseTime + (index - 85) * 1000;
      const maxPoints = index % 31 === 0 ? 1 : 120;
      optimized = appendBoundedNetworkTrailPoint(optimized, incoming, cutoff, maxPoints);
      reference = originalUpdate(reference, incoming, cutoff, maxPoints);
      expect(optimized, `step ${index}`).toEqual(reference);
      expect(optimized.length).toBeLessThanOrEqual(maxPoints);
    }
  });

  it("does not assume imported out-of-order or invalid trails are sorted", () => {
    const bad: TrailPoint[] = [
      point(5, 14.01),
      point(1, 14.001),
      point(3, 14.003, "bad-date"),
      point(7, 14.02),
    ];
    const cases = [
      { incoming: null, cutoff: baseTime + 2_000, limit: 120 },
      { incoming: point(8, 14.025), cutoff: baseTime + 2_000, limit: 2 },
      { incoming: null, cutoff: Number.NaN, limit: 120 },
    ];
    for (const item of cases) {
      const actual = appendBoundedNetworkTrailPoint(bad, item.incoming, item.cutoff, item.limit);
      expect(actual).toEqual(originalUpdate(bad, item.incoming, item.cutoff, item.limit));
    }
    // After a fallback result becomes chronological, the next update can
    // use the fast path without dropping a corrected older endpoint.
    const fallback = appendBoundedNetworkTrailPoint(bad, null, baseTime + 2_000, 120);
    const actual = appendBoundedNetworkTrailPoint(fallback, point(9, 14.03), baseTime + 6_000, 120);
    const expected = originalUpdate(fallback, point(9, 14.03), baseTime + 6_000, 120);
    expect(actual).toEqual(expected);
  });

  it("respects bounded maximum, age expiry, same-position tail, and identity across sources", () => {
    const initial = Array.from({ length: 70 }, (_, index) => point(index, 14 + index / 1_000_000));
    let previous: TrailPoint[] = [];
    for (const entry of initial) {
      previous = appendBoundedNetworkTrailPoint(previous, entry, baseTime - 1, 30);
    }
    expect(previous).toHaveLength(30);
    const corrected = { ...previous[previous.length - 1]!, recordedAt: new Date(baseTime + 80_000).toISOString() };
    expect(appendBoundedNetworkTrailPoint(previous, corrected, baseTime + 60_000, 30))
      .toEqual(originalUpdate(previous, corrected, baseTime + 60_000, 30));
    expect(appendBoundedNetworkTrailPoint(previous, null, baseTime + 75_000, 30)).toEqual([]);
    // A provenance switch supplies an empty base and must not inherit an old trail.
    expect(appendBoundedNetworkTrailPoint([], point(81, 14.08), baseTime, 30)).toHaveLength(1);
    expect(previous).toHaveLength(30);
  });
});
