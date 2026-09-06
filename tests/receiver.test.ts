import { describe, expect, it } from "vitest";
import { receiverPositionChanged, shouldRecenterOnReceiver } from "@/lib/receiver";

describe("receiver map centering", () => {
  const receiver = { lat: 50, lon: 14, name: "Test" };

  it("centers once for a real receiver and ignores repeated equal snapshots", () => {
    expect(shouldRecenterOnReceiver("readsb", null, receiver)).toBe(true);
    expect(shouldRecenterOnReceiver("readsb", receiver, receiver)).toBe(false);
    expect(shouldRecenterOnReceiver("mock", null, receiver)).toBe(false);
    expect(receiverPositionChanged(receiver, { ...receiver, lat: 51 })).toBe(true);
  });
});
