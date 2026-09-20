import { describe, expect, it } from "vitest";
import { aircraftIconRotationOffset } from "@/lib/aircraft/icon-orientation";

describe("aircraft icon orientation metadata", () => {
  it.each([
    "/aircraft-icons-tar1090/unknown.svg",
    "/aircraft-icons-tar1090/A320.svg",
    "/aircraft-icons-tar1090/B738.svg",
    "/aircraft-icons-tar1090/A359.svg",
    "/aircraft-icons-tar1090/B77W.svg",
    "/aircraft-icons-tar1090/E190.svg",
    "/aircraft-icons-tar1090/category-A7.svg",
    "/aircraft-icons-tar1090/category-B1.svg",
    "/aircraft-icons-tar1090/ground_square.svg",
  ])("declares north-up orientation for %s", (asset) => {
    expect(aircraftIconRotationOffset(asset)).toBe(0);
  });

  it("returns zero for unknown assets instead of applying a global hack", () => {
    expect(aircraftIconRotationOffset("future-family.svg")).toBe(0);
    expect(aircraftIconRotationOffset(null)).toBe(0);
  });
});
