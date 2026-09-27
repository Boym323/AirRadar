import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  auditAircraftIcons,
  inspectAircraftIconSvg,
} from "../scripts/aircraft-icon-audit.mjs";

describe("aircraft icon geometry audit", () => {
  it("reads declared SVG geometry and source aspect ratio", () => {
    const result = inspectAircraftIconSvg(
      '<svg width="23" height="32" viewBox="-10 -10 380 415"></svg>',
      "A320.svg",
    );
    expect(result).toMatchObject({
      code: "A320",
      declaredWidth: 23,
      declaredHeight: 32,
      aspectRatio: 380 / 415,
      orientation: "portrait",
    });
  });

  it("keeps the checked-in tar1090 icon catalog geometrically valid", () => {
    const directory = fileURLToPath(new URL("../public/aircraft-icons-tar1090/", import.meta.url));
    const report = auditAircraftIcons(directory);
    expect(report.count).toBeGreaterThan(100);
    expect(report.invalidCount).toBe(0);
    expect(report.icons.some((icon) => icon.code === "A388")).toBe(true);
    expect(report.icons.some((icon) => icon.code === "B738")).toBe(true);
    expect(report.icons.some((icon) => icon.code === "GND")).toBe(true);
  });
});
