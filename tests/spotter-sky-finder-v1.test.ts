import { describe, expect, it } from "vitest";
import { headingFromDeviceOrientation, shortestTurnDeg, skyFinderDirection } from "@/lib/spotter-sky-finder";

describe("Spotter Sky Finder V1", () => {
  it("computes the shortest relative turn", () => {
    expect(shortestTurnDeg(10, 350)).toBe(20);
    expect(shortestTurnDeg(350, 10)).toBe(-20);
    expect(shortestTurnDeg(180, 0)).toBe(-180);
  });

  it("classifies ahead, left, right and behind directions", () => {
    expect(skyFinderDirection(5, 0).turn).toBe("ahead");
    expect(skyFinderDirection(300, 0).turn).toBe("left");
    expect(skyFinderDirection(60, 0).turn).toBe("right");
    expect(skyFinderDirection(180, 0).turn).toBe("behind");
  });

  it("prefers iOS compass heading when present", () => {
    expect(headingFromDeviceOrientation({
      alpha: 123,
      absolute: false,
      webkitCompassHeading: 42,
    })).toBe(42);
  });

  it("uses absolute alpha as a fallback heading", () => {
    expect(headingFromDeviceOrientation({
      alpha: 90,
      absolute: true,
    })).toBe(270);
    expect(headingFromDeviceOrientation({
      alpha: 90,
      absolute: false,
    })).toBeNull();
  });
});
