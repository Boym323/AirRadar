import { describe, expect, it } from "vitest";
import { buildSpotterShareCardSvg, spotterShareFilename } from "@/lib/spotter-share-card";
import type { SpotterSkyStory } from "@/lib/spotter-story";

const story: SpotterSkyStory = {
  identity: "UAE139",
  registration: "A6-EVK",
  aircraftType: "A388",
  aircraftDescription: "Airbus A380-800",
  operator: "Emirates & Partners",
  manufacturer: "Airbus",
  year: "2019",
  origin: "DXB",
  destination: "PRG",
  originName: "Dubai International",
  destinationName: "Václav Havel Airport Prague",
  estimatedArrival: "2026-10-07T13:08:00Z",
  altitudeFt: 9400,
  groundSpeedKt: 228,
  verticalRateFpm: -1200,
  closestApproachKm: 1.2,
  secondsUntilClosest: 38,
  elevationAtClosestDeg: 61,
  phase: "approaching",
  interest: {
    score: 85,
    reasons: [{ code: "iconic_type", points: 30 }],
  },
};

describe("Spotter Share Card V1", () => {
  it("renders a self-contained SVG card from the current story", () => {
    const svg = buildSpotterShareCardSvg({
      story,
      generatedAt: "2026-10-07T13:05:00Z",
      locale: "cs",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("UAE139");
    expect(svg).toContain("DXB → PRG");
    expect(svg).toContain("1.2 km");
    expect(svg).toContain("9,400 ft");
    expect(svg).toContain("85/100");
    expect(svg).not.toContain("Emirates & Partners");
    expect(svg).toContain("Emirates &amp; Partners");
  });

  it("creates a stable safe filename", () => {
    expect(spotterShareFilename(story)).toBe("airradar-UAE139-spotter.svg");
    expect(spotterShareFilename({ identity: "EK 139 / A380" })).toBe("airradar-EK-139-A380-spotter.svg");
  });
});
