import { describe, expect, it } from "vitest";
import { mapBounded, mapSettledBounded } from "@/lib/server/bounded-batch";

describe("bounded live snapshot workers", () => {
  it("keeps concurrency bounded and preserves input ordering across out-of-order completions", async () => {
    let inFlight = 0;
    let peak = 0;
    const values = Array.from({ length: 480 }, (_, i) => i);
    const result = await mapBounded(values, 12, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return value * 2;
    });
    expect(result).toEqual(values.map((value) => value * 2));
    expect(peak).toBe(12);
    expect(inFlight).toBe(0);
  });

  it("matches allSettled output while limiting provider scheduling and continuing after failures", async () => {
    let inFlight = 0;
    let peak = 0;
    const values = Array.from({ length: 2048 }, (_, i) => i);
    const result = await mapSettledBounded(values, 16, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => setImmediate(resolve));
      inFlight -= 1;
      if (value % 9 === 0) throw new Error("provider unavailable");
      return value * 3;
    });
    expect(result).toHaveLength(values.length);
    expect(peak).toBe(16);
    expect(inFlight).toBe(0);
    result.forEach((settled, index) => {
      if (index % 9 === 0) {
        expect(settled.status).toBe("rejected");
      } else {
        expect(settled).toEqual({ status: "fulfilled", value: index * 3 });
      }
    });
  });

  it("handles empty batches and rejects invalid limits without starting work", async () => {
    const never = async () => { throw new Error("unexpected work"); };
    await expect(mapSettledBounded([], 24, never)).resolves.toEqual([]);
    await expect(mapBounded([], 24, never)).resolves.toEqual([]);
    await expect(mapBounded([1], 0, async (x) => x)).rejects.toThrow("invalid_bounded_concurrency");
    await expect(mapSettledBounded([1], Infinity, async (x) => x)).rejects.toThrow("invalid_bounded_concurrency");
  });
});
