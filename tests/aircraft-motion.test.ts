import { describe, expect, it } from "vitest";
import { createMotionHistory, normalizeHeading, predictedAircraftMotion, shortestAngleDelta, updateMotionHistory, type MotionObservation } from "@/lib/aircraft/motion";

const observation = (track: number | null, observedAt: number, lat = 50, lon = 14, sourceKey = "local:ADS-B"): MotionObservation => ({ lat, lon, observedAt, groundSpeed: 120, track, sourceKey });
function historyFor(...tracks: Array<[number | null, number]>) {
  let history = createMotionHistory(observation(tracks[0][0], tracks[0][1]));
  for (const [track, time] of tracks.slice(1)) history = updateMotionHistory(history, observation(track, time));
  return history;
}

describe("aircraft motion", () => {
  it.each([[359, 1, 2], [1, 359, -2], [2, 358, -4]])("uses shortest angle delta (%i -> %i)", (from, to, expected) => expect(shortestAngleDelta(from, to)).toBe(expected));
  it("keeps straight flight at zero turn rate", () => expect(historyFor([90, 0], [90, 1000]).turnRateDegPerSec).toBe(0));
  it("estimates a filtered right turn", () => expect(historyFor([90, 0], [95, 1000], [100, 2000]).turnRateDegPerSec).toBeGreaterThan(0));
  it("estimates a filtered left turn", () => expect(historyFor([180, 0], [175, 1000], [170, 2000]).turnRateDegPerSec).toBeLessThan(0));
  it("crosses north without a 360 degree spin", () => expect(historyFor([358, 0], [359, 1000], [0, 2000], [1, 3000], [2, 4000]).turnRateDegPerSec).toBeGreaterThanOrEqual(0));
  it("preserves the last trusted heading when track is missing or stale", () => {
    const history = historyFor([90, 0], [null, 1000]);
    expect(history.lastRenderHeading).toBe(90);
    expect(predictedAircraftMotion(observation(null, 1000), history, 20_000).track).toBe(90);
  });
  it("does not turn on low-speed position noise", () => {
    let history = createMotionHistory({ ...observation(90, 0), groundSpeed: 0.1 });
    history = updateMotionHistory(history, { ...observation(null, 1000, 50.0001, 14.0001), groundSpeed: 0.1 });
    expect(history.lastRenderHeading).toBe(90);
  });
  it("resets motion history on source switch", () => expect(updateMotionHistory(createMotionHistory(observation(90, 0)), observation(180, 1000, 50, 14, "network:MLAT")).turnRateDegPerSec).toBe(0));
  it("uses curved predicted heading and position during a turn", () => {
    const history = historyFor([90, 0], [100, 1000]);
    const motion = predictedAircraftMotion(observation(100, 1000), history, 2000);
    expect(normalizeHeading(motion.track ?? 0)).toBeGreaterThan(100);
    expect(motion.lng).toBeGreaterThan(14);
  });
  it("falls back to constant-track prediction without history", () => {
    const history = createMotionHistory(observation(0, 0));
    const motion = predictedAircraftMotion(observation(0, 0), history, 1000);
    expect(motion.track).toBe(0);
    expect(motion.lat).toBeGreaterThan(50);
  });
});
