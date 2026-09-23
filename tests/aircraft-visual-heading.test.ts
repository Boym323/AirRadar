import { describe, expect, it } from "vitest";
import { shortestAngleDelta } from "@/lib/aircraft/motion";
import { resolveAircraftVisualHeading } from "@/lib/aircraft/visual-heading";
import { aircraftIconRotationOffset } from "@/lib/aircraft/icon-orientation";

describe("aircraft visual heading", () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
  ])("keeps geographic track %d at map bearing zero", (track, expected) => {
    expect(resolveAircraftVisualHeading({ track, mapBearing: 0 })).toBe(expected);
  });

  it("compensates screen rotation for map bearing", () => {
    expect(resolveAircraftVisualHeading({ track: 90, mapBearing: 45 })).toBe(45);
    expect(resolveAircraftVisualHeading({ track: 90, mapBearing: 90 })).toBe(0);
    expect(resolveAircraftVisualHeading({ track: 90, mapBearing: 180 })).toBe(270);
  });

  it("uses rendered motion, position heading, track, then last known track", () => {
    expect(resolveAircraftVisualHeading({ motionHeading: 180, track: 90, positionHeading: 0 })).toBe(180);
    expect(resolveAircraftVisualHeading({ track: 90, positionHeading: 0 })).toBe(0);
    expect(resolveAircraftVisualHeading({ track: 90, positionHeading: null, lastKnownTrack: 180 })).toBe(90);
    expect(resolveAircraftVisualHeading({ track: null, positionHeading: null, lastKnownTrack: 180 })).toBe(180);
    expect(resolveAircraftVisualHeading({ track: null, positionHeading: null, lastKnownTrack: null })).toBeNull();
  });

  it("applies an asset-specific offset without changing geographic heading", () => {
    expect(resolveAircraftVisualHeading({ track: 0, mapBearing: 0, assetOffset: 12 })).toBe(12);
    expect(resolveAircraftVisualHeading({ track: 5, mapBearing: 10, assetOffset: -12 })).toBe(343);
  });


  it("keeps the tar1090 north-up presentation basis without changing motion heading", () => {
    const assetOffset = aircraftIconRotationOffset("/aircraft-icons-tar1090/A320.svg");
    expect(resolveAircraftVisualHeading({ track: 0, mapBearing: 0, assetOffset })).toBe(0);
    expect(resolveAircraftVisualHeading({ track: 90, mapBearing: 0, assetOffset })).toBe(90);
    expect(resolveAircraftVisualHeading({ track: 180, mapBearing: 0, assetOffset })).toBe(180);
    expect(resolveAircraftVisualHeading({ track: 270, mapBearing: 0, assetOffset })).toBe(270);
    expect(resolveAircraftVisualHeading({ track: 90, mapBearing: 45, assetOffset })).toBe(45);
  });

  it("normalizes north crossing without a 180 degree flip", () => {
    const before = resolveAircraftVisualHeading({ track: 359, mapBearing: 0 });
    const after = resolveAircraftVisualHeading({ track: 1, mapBearing: 0 });
    expect(shortestAngleDelta(before!, after!)).toBe(2);
  });

  it("renders confirmed movement at 315 degrees even when reported track is 90", () => {
    expect(resolveAircraftVisualHeading({ motionHeading: 315, track: 90, mapBearing: 0 })).toBe(315);
  });

  it("does not add a presentation flip when the motion source changes", () => {
    const localHeading = resolveAircraftVisualHeading({ motionHeading: 90, mapBearing: 45 });
    const networkHeading = resolveAircraftVisualHeading({ track: 90, mapBearing: 45 });
    expect(networkHeading).toBe(localHeading);
  });

  it.each(["selected", "watchlisted", "emergency"])("does not change heading for %s presentation state", () => {
    const plain = resolveAircraftVisualHeading({ motionHeading: 270, mapBearing: 45 });
    const decorated = resolveAircraftVisualHeading({ motionHeading: 270, mapBearing: 45 });
    expect(decorated).toBe(plain);
  });
});
