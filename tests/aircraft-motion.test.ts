import { describe, expect, it } from "vitest";
import { interpolateHeading, motionAt, normalizeHeading, predictedPosition, predictionIsActive, shortestAngleDelta } from "@/lib/aircraft/motion";

describe("aircraft motion", () => {
  it.each([[-1, 359], [360, 0], [361, 1], [721, 1]])("normalizes heading", (input, expected) => expect(normalizeHeading(input)).toBe(expected));
  it.each([[359, 0, 1], [359, 1, 2], [1, 359, -2], [0, 359, -1], [179, 181, 2], [181, 179, -2]])("uses shortest angle", (from, to, expected) => expect(shortestAngleDelta(from, to)).toBe(expected));
  it("keeps north-up track semantics", () => { const source = { lat: 50, lon: 14, observedAt: 0, receivedAt: 0, groundSpeed: 360, track: 0 }; expect(predictedPosition(source, 1000)[1]).toBeGreaterThan(50); });
  it("does not extrapolate without a trusted position time or after the horizon", () => { const source = { lat: 50, lon: 14, observedAt: null, receivedAt: 0, groundSpeed: 360, track: 90 }; expect(motionAt(source, 100000).predictionActive).toBe(false); });
  it("interpolates turns across north", () => expect(interpolateHeading(359, 1, .5)).toBe(0));
  it("keeps rendered nose aligned with cardinal movement", () => {
    for (const [track, expected] of [[0, 0], [90, 90], [180, 180], [270, 270]] as const) {
      const source = { lat: 50, lon: 14, observedAt: 0, receivedAt: 0, groundSpeed: 360, track };
      expect(shortestAngleDelta(expected, motionAt(source, 1000).heading!)).toBe(0);
      expect(predictionIsActive(source, 1000)).toBe(true);
    }
  });
  it("stops prediction and correction after the absolute horizon", () => {
    const source = { lat: 50, lon: 14, observedAt: 0, receivedAt: 0, groundSpeed: 360, track: 90 };
    const result = motionAt(source, 15_001, { lon: 0.001, lat: 0, startedAt: 0, durationMs: 5000 });
    expect(result.predictionActive).toBe(false);
    expect(result.correctionActive).toBe(false);
  });
});
