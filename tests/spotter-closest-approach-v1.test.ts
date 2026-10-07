import { describe, expect, it } from "vitest";
import { predictClosestApproach } from "@/lib/spotter-location";

const observer = {
  lat: 50,
  lon: 14,
  altitudeMeters: 300,
  accuracyMeters: 5,
  capturedAt: "2026-10-07T12:00:00Z",
};

describe("Spotter Closest Approach V1", () => {
  it("predicts an approaching eastbound target crossing the observer longitude", () => {
    const result = predictClosestApproach({
      lat: 50,
      lon: 13.98,
      altitude: 10_000,
      groundSpeed: 240,
      track: 90,
      verticalRate: 0,
    }, observer);
    expect(result).not.toBeNull();
    expect(result!.phase).toBe("approaching");
    expect(result!.secondsUntilClosest).toBeGreaterThan(0);
    expect(result!.secondsUntilClosest).toBeLessThan(180);
    expect(result!.closestHorizontalDistanceKm).toBeLessThan(0.1);
    expect(result!.closestSlantDistanceKm).not.toBeNull();
  });

  it("marks a target moving away as departing", () => {
    const result = predictClosestApproach({
      lat: 50,
      lon: 14.02,
      altitude: 10_000,
      groundSpeed: 240,
      track: 90,
      verticalRate: 0,
    }, observer);
    expect(result!.phase).toBe("departing");
    expect(result!.secondsUntilClosest).toBe(0);
  });

  it("bounds projection to ten minutes by default", () => {
    const result = predictClosestApproach({
      lat: 50,
      lon: 13,
      altitude: 35_000,
      groundSpeed: 100,
      track: 90,
      verticalRate: 0,
    }, observer);
    expect(result!.secondsUntilClosest).toBe(600);
  });
});
