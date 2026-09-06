import { describe, expect, it } from "vitest";
import { haversineDistanceKm, initialBearing } from "@/lib/geo";

describe("geo helpers", () => {
  it("returns zero distance for the same point", () => {
    expect(haversineDistanceKm(50, 14, 50, 14)).toBe(0);
  });

  it("calculates Prague to Vienna distance within a useful range", () => {
    const distance = haversineDistanceKm(50.0755, 14.4378, 48.2082, 16.3738);
    expect(distance).toBeGreaterThan(250);
    expect(distance).toBeLessThan(270);
  });

  it("returns a normalized bearing", () => {
    const bearing = initialBearing(50, 14, 51, 14);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
  });
});
