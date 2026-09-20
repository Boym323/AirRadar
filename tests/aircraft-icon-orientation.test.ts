import { describe, expect, it } from "vitest";
import {
  aircraftIconRotationOffset,
  TAR1090_ICON_ROTATION_OFFSET_DEG,
} from "@/lib/aircraft/icon-orientation";

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
  ])("keeps the north-up tar1090 visual basis for %s", (asset) => {
    expect(aircraftIconRotationOffset(asset)).toBe(TAR1090_ICON_ROTATION_OFFSET_DEG);
    expect(TAR1090_ICON_ROTATION_OFFSET_DEG).toBe(0);
  });

  it("does not apply the tar1090 correction to unrelated future asset families", () => {
    expect(aircraftIconRotationOffset("/aircraft-icons-future/A320.svg")).toBe(0);
    expect(aircraftIconRotationOffset("airplane")).toBe(0);
    expect(aircraftIconRotationOffset(null)).toBe(0);
  });
});
