import { describe, expect, it } from "vitest";
import { forcedReconnectDelayMs } from "@/components/use-aircraft-stream";

describe("forced SSE reconnect backoff", () => {
  it("backs off exponentially and caps persistent protocol failures", () => {
    expect([0, 1, 2, 3, 4, 5].map(forcedReconnectDelayMs)).toEqual([250, 500, 1_000, 2_000, 4_000, 8_000]);
    expect(forcedReconnectDelayMs(6)).toBe(10_000);
    expect(forcedReconnectDelayMs(20)).toBe(10_000);
  });

  it("normalizes invalid attempt counters", () => {
    expect(forcedReconnectDelayMs(-3)).toBe(250);
    expect(forcedReconnectDelayMs(1.9)).toBe(500);
  });
});
