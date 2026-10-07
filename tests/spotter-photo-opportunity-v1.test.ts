import { describe, expect, it } from "vitest";
import { scorePhotoOpportunity } from "@/lib/spotter-photo-opportunity";

describe("Spotter Photo Opportunity V1", () => {
  it("rewards interesting aircraft, good visibility, elevation and side light", () => {
    const result = scorePhotoOpportunity(
      { score: 80, reasons: [{ code: "iconic_type", points: 30 }] },
      {
        status: "GOOD",
        score: 90,
        elevationDeg: 55,
        slantDistanceKm: 2.5,
        horizontalDistanceKm: 1.5,
        visibilityMeters: 10_000,
        ceilingFtAgl: 8_000,
        weatherStationId: "LKPR",
        weatherStationDistanceKm: 20,
        aircraftAboveCeiling: false,
        reasons: ["HIGH_ELEVATION", "GOOD_VISIBILITY"],
      },
      {
        azimuthDeg: 240,
        elevationDeg: 18,
        period: "DAY",
        aircraftBearingDeg: 150,
        azimuthDifferenceDeg: 90,
        lighting: "SIDE",
      },
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.reasons.map((reason) => reason.code)).toContain("SIDE_LIGHT");
    expect(result.reasons.map((reason) => reason.code)).toContain("HIGH_ELEVATION");
  });

  it("penalizes poor visibility, backlight and night", () => {
    const result = scorePhotoOpportunity(
      { score: 20, reasons: [] },
      {
        status: "POOR",
        score: 20,
        elevationDeg: 5,
        slantDistanceKm: 15,
        horizontalDistanceKm: 14,
        visibilityMeters: 2_000,
        ceilingFtAgl: 1_500,
        weatherStationId: "LKPR",
        weatherStationDistanceKm: 20,
        aircraftAboveCeiling: true,
        reasons: ["POOR_VISIBILITY", "ABOVE_CEILING"],
      },
      {
        azimuthDeg: 180,
        elevationDeg: -12,
        period: "NIGHT",
        aircraftBearingDeg: 180,
        azimuthDifferenceDeg: 0,
        lighting: "UNAVAILABLE",
      },
    );
    expect(result.score).toBeLessThan(20);
    expect(result.reasons.map((reason) => reason.code)).toContain("NIGHT");
    expect(result.reasons.map((reason) => reason.code)).toContain("POOR_VISIBILITY");
  });

  it("caps combined evidence at 100", () => {
    const result = scorePhotoOpportunity(
      { score: 100, reasons: [] },
      {
        status: "GOOD",
        score: 100,
        elevationDeg: 80,
        slantDistanceKm: 1,
        horizontalDistanceKm: 0.5,
        visibilityMeters: 20_000,
        ceilingFtAgl: null,
        weatherStationId: "LKPR",
        weatherStationDistanceKm: 5,
        aircraftAboveCeiling: null,
        reasons: ["HIGH_ELEVATION", "GOOD_VISIBILITY"],
      },
      {
        azimuthDeg: 180,
        elevationDeg: 8,
        period: "GOLDEN_HOUR",
        aircraftBearingDeg: 0,
        azimuthDifferenceDeg: 180,
        lighting: "FRONT",
      },
    );
    expect(result.score).toBe(100);
  });
});
