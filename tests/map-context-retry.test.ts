import { describe, expect, it } from "vitest";
import { mapContextRetryDelayMs } from "@/lib/map-time/retry";

describe("map context retry backoff", () => {
  it("backs off transient failures and caps retries", () => {
    expect([0, 1, 2, 3, 4].map(mapContextRetryDelayMs)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
    expect(mapContextRetryDelayMs(5)).toBe(30_000);
    expect(mapContextRetryDelayMs(20)).toBe(30_000);
  });

  it("normalizes invalid attempt counters", () => {
    expect(mapContextRetryDelayMs(-1)).toBe(1_000);
    expect(mapContextRetryDelayMs(1.9)).toBe(2_000);
  });
});
