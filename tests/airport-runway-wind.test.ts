import { describe, expect, it } from "vitest";
import { calculateRunwayWind, selectWindFavoredRunway, shortestAngularDifference } from "@/lib/airport-runway-wind";

describe("runway wind components", () => {
  it("calculates headwind, tailwind and crosswind", () => {
    expect(calculateRunwayWind(270, 270, 11)).toMatchObject({ headwindKt: 11, crosswindKt: 0, tailwindKt: 0 });
    expect(calculateRunwayWind(270, 90, 3)).toMatchObject({ headwindKt: -3, crosswindKt: 0, tailwindKt: 3 });
    expect(calculateRunwayWind(270, 360, 10)).toMatchObject({ headwindKt: 0, crosswindKt: 10, tailwindKt: 0 });
  });

  it("uses the shortest wraparound angle", () => {
    expect(shortestAngularDifference(10, 350)).toBe(-20);
    expect(calculateRunwayWind(10, 350, 10)?.crosswindKt).toBeCloseTo(3.4, 1);
  });

  it("does not select a runway for variable or calm wind", () => {
    const runways = [{ ident: "09", heading: 90 }];
    expect(selectWindFavoredRunway(runways, (runway) => [{ headingDeg: runway.heading }], null, 10)).toBeNull();
    expect(selectWindFavoredRunway(runways, (runway) => [{ headingDeg: runway.heading }], 90, 0)).toBeNull();
  });

  it("selects the wind-favored direction without calling it active", () => {
    const runways = [{ ident: "27", heading: 270 }, { ident: "09", heading: 90 }];
    expect(selectWindFavoredRunway(runways, (runway) => [{ headingDeg: runway.heading }], 280, 12)).toMatchObject({ runway: runways[0] });
  });
});
