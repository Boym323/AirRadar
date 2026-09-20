import { describe, expect, it } from "vitest";
import { createMotionHistory, interpolateHeading, motionAt, normalizeHeading, predictedPosition, predictionIsActive, shortestAngleDelta, updateMotionHistory } from "@/lib/aircraft/motion";

const source = (track: number | null, observedAt: number, lat = 50, lon = 14) => ({ lat, lon, observedAt, groundSpeed: 120, track, positionOrigin: "local", positionSource: "readsb" });

describe("aircraft motion", () => {
  it.each([[-1, 359], [360, 0], [361, 1], [721, 1]])("normalizes heading", (input, expected) => expect(normalizeHeading(input)).toBe(expected));
  it("uses shortest angle deltas across north", () => {
    expect(shortestAngleDelta(359, 1)).toBe(2);
    expect(shortestAngleDelta(1, 359)).toBe(-2);
  });

  it("estimates and applies a filtered turn rate", () => {
    const history = createMotionHistory();
    updateMotionHistory(history, source(90, 1_000));
    updateMotionHistory(history, source(95, 2_000));
    updateMotionHistory(history, source(100, 3_000));
    expect(history.turnRateDegPerSec).toBeGreaterThan(0);
    expect(motionAt(source(100, 3_000), 4_000, undefined, history).heading).toBeGreaterThan(100);
  });

  it("preserves heading when a report omits track", () => {
    const history = createMotionHistory();
    updateMotionHistory(history, source(270, 1_000));
    updateMotionHistory(history, source(null, 2_000));
    expect(motionAt(source(null, 2_000), 2_500, undefined, history).heading).not.toBeNull();
  });
  it("keeps north-up track semantics", () => { const s = { lat: 50, lon: 14, observedAt: 0, receivedAt: 0, groundSpeed: 360, track: 0 }; expect(predictedPosition(s, 1000)[1]).toBeGreaterThan(50); });
  it("does not extrapolate without a trusted position time or after the horizon", () => { const s = { lat: 50, lon: 14, observedAt: null, receivedAt: 0, groundSpeed: 360, track: 90 }; expect(motionAt(s, 100000).predictionActive).toBe(false); });
  it("interpolates turns across north", () => expect(interpolateHeading(359, 1, .5)).toBe(0));
  it("keeps rendered nose aligned with cardinal movement", () => {
    for (const [track, expected] of [[0, 0], [90, 90], [180, 180], [270, 270]] as const) {
      const s = { lat: 50, lon: 14, observedAt: 0, receivedAt: 0, groundSpeed: 360, track };
      expect(shortestAngleDelta(expected, motionAt(s, 1000).heading!)).toBe(0);
      expect(predictionIsActive(s, 1000)).toBe(true);
    }
  });
  it("stops prediction and correction after the absolute horizon", () => {
    const s = { lat: 50, lon: 14, observedAt: 0, receivedAt: 0, groundSpeed: 360, track: 90 };
    const result = motionAt(s, 15_001, { lon: 0.001, lat: 0, startedAt: 0, durationMs: 5000 });
    expect(result.predictionActive).toBe(false);
    expect(result.correctionActive).toBe(false);
  });
});
