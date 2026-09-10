import { describe, expect, it } from "vitest";
import { deriveFlightCategory } from "@/lib/weather/flight-category";

const clouds = (cover: string, baseFtAgl: number) => [{ cover, baseFtAgl }];

describe("TAF flight-category derivation", () => {
  it("uses standard ceiling and visibility thresholds", () => {
    expect(deriveFlightCategory(clouds("BKN", 4_000), 6 * 1609.344)).toBe("VFR");
    expect(deriveFlightCategory(clouds("BKN", 3_000), 6 * 1609.344)).toBe("MVFR");
    expect(deriveFlightCategory(clouds("BKN", 999), 6 * 1609.344)).toBe("IFR");
    expect(deriveFlightCategory(clouds("BKN", 499), 6 * 1609.344)).toBe("LIFR");
    expect(deriveFlightCategory([], 5 * 1609.344)).toBe("MVFR");
    expect(deriveFlightCategory([], 3 * 1609.344)).toBe("MVFR");
    expect(deriveFlightCategory([], 2.99 * 1609.344)).toBe("IFR");
    expect(deriveFlightCategory([], 0.99 * 1609.344)).toBe("LIFR");
  });

  it("returns the worse of ceiling and visibility and ignores non-ceiling layers", () => {
    expect(deriveFlightCategory([{ cover: "SCT", baseFtAgl: 100 }], 10 * 1609.344)).toBe("VFR");
    expect(deriveFlightCategory(clouds("BKN", 4_000), 2 * 1609.344)).toBe("IFR");
    expect(deriveFlightCategory(clouds("OVC", 4_000), 10 * 1609.344)).toBe("VFR");
    expect(deriveFlightCategory([], null)).toBeNull();
  });
});
