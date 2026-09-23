import { describe, expect, it } from "vitest";
import { MAX_PREDICTION_AGE_MS, confirmedInterpolationDurationMs, correctionFor, createMotionHistory, interpolateHeading, motionAt, motionObservationAdvances, motionRenderIntervalMs, normalizeHeading, predictedPosition, predictionIsActive, shortestAngleDelta, updateMotionHistory, visualHeadingForConfirmedPosition } from "@/lib/aircraft/motion";
import { destinationPoint } from "@/lib/geo";

const source = (track: number | null, observedAt: number, lat = 50, lon = 14) => ({ lat, lon, observedAt, groundSpeed: 120, track, positionOrigin: "local", positionSource: "readsb" });

describe("aircraft motion", () => {
  it.each([[-1, 359], [360, 0], [361, 1], [721, 1]])("normalizes heading", (input, expected) => expect(normalizeHeading(input)).toBe(expected));
  it("uses shortest angle deltas across north", () => {
    expect(shortestAngleDelta(359, 1)).toBe(2);
    expect(shortestAngleDelta(1, 359)).toBe(-2);
  });

  it("keeps dead reckoning on the reported track even when history detects a turn", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, source(90, 1_000));
    history = updateMotionHistory(history, source(95, 2_000));
    history = updateMotionHistory(history, source(100, 3_000));
    expect(history.turnRateDegPerSec).toBeGreaterThan(0);
    expect(motionAt(source(100, 3_000), 4_000, undefined, history).heading).toBe(100);

    const withHistory = predictedPosition(source(100, 3_000), 4_000, history);
    const straight = predictedPosition(source(100, 3_000), 4_000);
    expect(withHistory[0]).toBeCloseTo(straight[0], 10);
    expect(withHistory[1]).toBeCloseTo(straight[1], 10);
  });

  it("preserves heading when a report omits track", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, source(270, 1_000));
    history = updateMotionHistory(history, source(null, 2_000));
    expect(motionAt(source(null, 2_000), 2_500, undefined, history).heading).not.toBeNull();
  });
  it("infers heading from position-only updates", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, { ...source(null, 1_000), lat: 50, lon: 14 });
    history = updateMotionHistory(history, { ...source(null, 2_000), lat: 49.999, lon: 14 });
    expect(motionAt({ ...source(null, 2_000), lat: 49.999, lon: 14 }, 2_000, undefined, history).heading).toBe(180);
  });
  it.each([
    0, 90, 180, 270, 135, 315,
  ])("derives visual heading from confirmed %s movement", (bearing) => {
    const current = { lat: 50, lon: 14 };
    const [lon, lat] = destinationPoint(current.lat, current.lon, 0.1, bearing);
    const next = source(90, 2_000, lat, lon);
    const history = updateMotionHistory(createMotionHistory(), source(90, 1_000, current.lat, current.lon));

    expect(visualHeadingForConfirmedPosition(current, next, history)).toBeCloseTo(bearing, 5);
  });
  it("keeps the reported track out of a confirmed movement mismatch", () => {
    const current = { lat: 50, lon: 14 };
    const [lon, lat] = destinationPoint(current.lat, current.lon, 0.1, 315);
    const next = { ...source(90, 2_000, lat, lon), allowPrediction: false as const };
    const history = updateMotionHistory(createMotionHistory(), source(90, 1_000, current.lat, current.lon));
    const visualHeading = visualHeadingForConfirmedPosition(current, next, history);
    const correction = { lon: current.lon - next.lon, lat: current.lat - next.lat, startedAt: 2_000, durationMs: 1_000 };

    expect(visualHeading).toBeCloseTo(315, 5);
    expect(motionAt(next, 2_500, correction, history, visualHeading).heading).toBeCloseTo(315, 5);
  });
  it("uses the confirmed position heading before track for small movement noise", () => {
    const history = { ...createMotionHistory(), positionHeading: 225, lastTrack: 180 };
    const current = { lat: 50, lon: 14 };
    const next = source(90, 2_000, 50.0001, 14);

    expect(visualHeadingForConfirmedPosition(current, next, history)).toBe(225);
  });
  it("falls back from reported track to the last known track", () => {
    const history = { ...createMotionHistory(), lastTrack: 270 };
    const current = { lat: 50, lon: 14 };
    expect(visualHeadingForConfirmedPosition(current, source(90, 2_000), history)).toBe(90);
    expect(visualHeadingForConfirmedPosition(current, source(null, 2_000), history)).toBe(270);
  });
  it("keeps a stored visual heading stable for every interpolation frame", () => {
    const next = { ...source(90, 2_000, 50.002, 14.002), allowPrediction: false as const };
    const correction = { lon: -0.002, lat: -0.002, startedAt: 2_000, durationMs: 1_000 };
    const headings = [2_000, 2_250, 2_500, 2_750, 3_000].map((timestamp) => motionAt(next, timestamp, correction, undefined, 315).heading);

    expect(headings).toEqual([315, 315, 315, 315, 315]);
  });
  it("keeps history and turn rate for normal movement from the same source", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, source(90, 1_000));
    history = updateMotionHistory(history, source(100, 2_000));
    const next = updateMotionHistory(history, source(110, 3_000, 50.001, 14.001));
    expect(next.turnRateDegPerSec).toBeGreaterThan(0);
    expect(next.lastTrack).toBe(110);
    expect(next.previousTrack).toBe(100);
  });
  it("does not let an out-of-order position roll motion history back", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, source(90, 10_000, 50, 14));
    history = updateMotionHistory(history, source(100, 11_000, 50.001, 14.001));
    const delayed = updateMotionHistory(history, source(270, 8_000, 51, 15));

    expect(delayed).toEqual(history);
    expect(delayed.lastObservedAt).toBe(11_000);
    expect(delayed.lastLat).toBe(50.001);
    expect(delayed.lastLon).toBe(14.001);
  });
  it("does not keep rotating past the latest reported track", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, source(359, 1_000));
    history = updateMotionHistory(history, source(1, 2_000));

    const headings = [2_000, 2_250, 2_500, 2_750, 3_000].map((timestamp) => motionAt(source(1, 2_000), timestamp, undefined, history).heading);
    expect(headings).toEqual([1, 1, 1, 1, 1]);
  });
  it("resets all motion state on a source switch", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, source(90, 1_000));
    history = updateMotionHistory(history, source(110, 2_000));
    const switched = updateMotionHistory(history, { ...source(270, 3_000), positionOrigin: "network", positionSource: "MLAT" });
    expect(switched).toMatchObject({ source: "network:MLAT", lastTrack: null, previousTrack: null, turnRateDegPerSec: 0, lastLat: 50, lastLon: 14 });
    expect(switched).not.toBe(history);
  });
  it("resets prediction state after a large position jump and rebuilds it afterward", () => {
    let history = createMotionHistory();
    history = updateMotionHistory(history, source(90, 1_000));
    history = updateMotionHistory(history, source(100, 2_000));
    const jumped = updateMotionHistory(history, source(200, 3_000, 51, 15));
    expect(jumped.turnRateDegPerSec).toBe(0);
    expect(jumped.lastTrack).toBeNull();
    const rebuilt = updateMotionHistory(jumped, source(210, 4_000, 51.001, 15.001));
    expect(rebuilt.lastTrack).toBe(210);
    expect(rebuilt.turnRateDegPerSec).toBe(0);
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
    const result = motionAt(s, MAX_PREDICTION_AGE_MS + 1, { lon: 0.001, lat: 0, startedAt: 0, durationMs: 5000 });
    expect(result.predictionActive).toBe(false);
    expect(result.correctionActive).toBe(false);
  });

  it("smooths bounded position-only corrections without enabling extrapolation", () => {
    const history = updateMotionHistory(createMotionHistory(), {
      lat: 50,
      lon: 14,
      observedAt: 1_000,
      groundSpeed: null,
      track: null,
      positionOrigin: "local",
      positionSource: "readsb",
    });
    const source = {
      lat: 50.002,
      lon: 14.002,
      observedAt: 2_000,
      groundSpeed: null,
      track: null,
      positionOrigin: "local",
      positionSource: "readsb",
    };
    const correction = correctionFor({ lat: 50, lon: 14 }, source, 2_000, 1_000, history);
    expect(correction).not.toBeNull();
    const halfway = motionAt(source, 2_500, correction!, updateMotionHistory(history, source));
    expect(halfway.predictionActive).toBe(false);
    expect(halfway.correctionActive).toBe(true);
    expect(halfway.lat).toBeGreaterThan(50);
    expect(halfway.lat).toBeLessThan(source.lat);
  });

  it("rejects stale corrections so callers snap instead of scheduling an inert animation", () => {
    const source = {
      lat: 50.002,
      lon: 14.002,
      observedAt: 1_000,
      groundSpeed: 180,
      track: 90,
      positionOrigin: "local",
      positionSource: "readsb",
    };
    expect(correctionFor({ lat: 50, lon: 14 }, source, MAX_PREDICTION_AGE_MS + 1_001, 1_000)).toBeNull();
  });

  it("does not treat duplicate position timestamps as a new motion observation", () => {
    const previous = source(90, 10_000, 50, 14);
    expect(motionObservationAdvances(previous, { ...previous, groundSpeed: 130, track: 91 })).toBe(false);
    expect(motionObservationAdvances(previous, { ...previous, observedAt: 10_050, lat: 50.0001 })).toBe(false);
    expect(motionObservationAdvances(previous, { ...previous, observedAt: 10_101, lat: 50.0001 })).toBe(true);
  });

  it("accepts an immediate observation when the position source changes", () => {
    const previous = source(90, 10_000, 50, 14);
    const switched = { ...previous, observedAt: 10_000, positionOrigin: "network", positionSource: "ADS-B" };
    expect(motionObservationAdvances(previous, switched)).toBe(true);
  });

  it("disables forward prediction for confirmed-position interpolation", () => {
    const s = { ...source(90, 1_000), groundSpeed: 420, allowPrediction: false };
    expect(predictedPosition(s, 5_000)).toEqual([s.lon, s.lat]);
    expect(predictionIsActive(s, 5_000)).toBe(false);

    const correction = correctionFor({ lat: 50, lon: 13.99 }, s, 1_000, 900);
    expect(correction).not.toBeNull();
    const halfway = motionAt(s, 1_450, correction!);
    expect(halfway.lon).toBeGreaterThan(13.99);
    expect(halfway.lon).toBeLessThan(14);
  });

  it("keeps confirmed interpolation active beyond the prediction horizon", () => {
    const s = { ...source(90, 1_000), allowPrediction: false };
    const correction = { lon: -0.01, lat: 0, startedAt: 1_000, durationMs: 9_000 };
    const result = motionAt(s, 8_500, correction);
    expect(result.stale).toBe(false);
    expect(result.correctionActive).toBe(true);
    const later = motionAt(s, 9_500, correction);
    expect(later.stale).toBe(true);
    expect(later.correctionActive).toBe(true);
  });
  it("creates a correction for a slow confirmed report beyond the prediction horizon", () => {
    const s = {
      ...source(90, 1_000, 50.01, 14.01),
      allowPrediction: false,
    };
    const correction = correctionFor(
      { lat: 50, lon: 14 },
      s,
      MAX_PREDICTION_AGE_MS + 5_000,
      9_000,
    );

    expect(correction).not.toBeNull();
    const halfway = motionAt(s, MAX_PREDICTION_AGE_MS + 9_500, correction!);
    expect(halfway.correctionActive).toBe(true);
    expect(halfway.lat).toBeGreaterThan(50);
    expect(halfway.lat).toBeLessThan(s.lat);
  });

  it("still rejects stale predictive corrections", () => {
    const s = {
      ...source(90, 1_000, 50.01, 14.01),
      allowPrediction: true,
    };
    expect(correctionFor(
      { lat: 50, lon: 14 },
      s,
      MAX_PREDICTION_AGE_MS + 5_000,
      1_000,
    )).toBeNull();
  });


  it("matches interpolation duration to browser delivery cadence without stop-go gaps", () => {
    const previous = source(90, 10_000);
    const next = source(90, 11_000, 50.001, 14.001);

    // Delivery cadence wins over the noisier observation cadence.
    expect(confirmedInterpolationDurationMs(previous, next, 3_000)).toBe(3_240);
    expect(confirmedInterpolationDurationMs(previous, { ...next, observedAt: 13_000 }, 3_000)).toBe(3_240);

    // Slow network tracks may bridge the full delivery cadence instead of
    // stopping early and waiting for the next point.
    expect(confirmedInterpolationDurationMs(previous, { ...next, observedAt: 20_000 }, 10_000, 300, 12_000)).toBe(10_800);

    // Invalid/too-small delivery gaps still use a safe bounded fallback.
    expect(confirmedInterpolationDurationMs(previous, { ...next, observedAt: null }, 200)).toBe(300);
  });

  it("keeps confirmed interpolation active through the next expected delivery", () => {
    const previous = source(90, 10_000, 50, 14);
    const next = { ...source(90, 11_000, 50.001, 14.001), allowPrediction: false };
    const durationMs = confirmedInterpolationDurationMs(previous, next, 1_000);
    const correction = correctionFor({ lat: 50, lon: 14 }, next, 11_000, durationMs);

    expect(durationMs).toBe(1_080);
    expect(correction).not.toBeNull();
    expect(motionAt(next, 12_000, correction!).correctionActive).toBe(true);
    expect(motionAt(next, 12_080, correction!).correctionActive).toBe(false);
  });

  it("throttles only high-density bulk marker rendering", () => {
    expect(motionRenderIntervalMs(79)).toBe(0);
    expect(motionRenderIntervalMs(80)).toBeCloseTo(1000 / 30, 8);
    expect(motionRenderIntervalMs(200)).toBeCloseTo(1000 / 30, 8);
  });
});
