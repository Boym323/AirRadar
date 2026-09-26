import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error The production gate helper is runtime-only ESM consumed by Node.
import { assertMigrationSource, assertProductionReleaseMetadata, isProductionGateFullSmokeViewport, isProductionGateMarkerSmokeViewport, resolveProductionGateChannel } from "../scripts/production-gates.mjs";

describe("production release metadata gate", () => {
  it("accepts only the stable production pair", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0", channel: "production" }, "stable")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" }, "stable")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.1", channel: "production" }, "stable")).toThrow();
  });

  it("accepts canonical 1.0.0 RC metadata and rejects arbitrary versions", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0", channel: "production" })).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" })).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "release-candidate" }, "rc")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.99", channel: "release-candidate" }, "rc")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.0", channel: "release-candidate" }, "rc")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "2.0.0-rc.1", channel: "release-candidate" }, "rc")).toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.0-rc.1", channel: "production" }, "rc")).toThrow();
  });

  it("supports the version emitted by the current build metadata", () => {
    expect(() => assertProductionReleaseMetadata({ version: "1.0.7", channel: "production" }, "auto", "1.0.7")).not.toThrow();
    expect(() => assertProductionReleaseMetadata({ version: "1.0.6", channel: "production" }, "auto", "1.0.7")).toThrow();
  });

  it("rejects an unconfigured or arbitrary gate mode", () => {
    expect(resolveProductionGateChannel(undefined)).toBe("auto");
    expect(resolveProductionGateChannel("RC")).toBe("rc");
    expect(() => resolveProductionGateChannel("anything")).toThrow();
  });

  it("validates the complete checked-in migration chain", () => {
    const result = assertMigrationSource(process.cwd());
    expect(result.directories).toHaveLength(12);
    expect(result.directories.at(-1)).toBe("20260919T1908_receiver_coverage_hourly");
    expect(result.finalContractHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("keeps breakpoint edges in the no-reload sweep while reloading only representative devices", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const sweepWidths = [430, 480, 700, 720, 820, 821, 899, 900, 901, 950, 951, 1024, 1100, 1101, 1400, 1401]");
    for (const viewport of ["320x844", "375x812", "820x1180", "821x1000", "1100x900", "1920x1080"]) {
      const [width, height] = viewport.split("x");
      expect(source).toContain(`{ width: ${width}, height: ${height} }`);
    }
    expect(source).not.toContain("{ width: 430, height: 932 }");
    expect(source).not.toContain("{ width: 768, height: 1024 }");
    expect(source).not.toContain("{ width: 900, height: 900 }");
    expect(source).not.toContain("{ width: 1440, height: 900 }");
    expect(source).not.toContain("{ width: 1200, height: 900 }");
    expect(source).not.toContain("{ width: 902, height: 900 }");
    expect(source).not.toContain("{ width: 1150, height: 900 }");
  });

  it("keeps mobile navigation geometry assertions out of the Node global scope", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("navLayout.items.some((item) => item.y < 0 || item.right > viewport.width + 1)");
  });

  it("verifies cross-country datasets from sources without touring the map", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('map.querySourceFeatures("atc-sectors")');
    expect(source).toContain('map.querySourceFeatures("ats-routes")');
    expect(source).not.toContain('jumpTo({ center: [17.9, 49.0]');
    expect(source).not.toContain('jumpTo({ center: [19.5, 48.8]');
    expect(source).not.toContain('text.includes("reconnecting")');
  });

  it("runs dataset map-source smoke only on the desktop representative", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("const dataLayerSmoke = fullSmoke && viewport.width >= 821");
    expect(source).toContain("if (dataLayerSmoke) {");
    expect(source).toContain("Dataset requests did not complete");
    expect(source).not.toContain("temporary fixture failure");
    expect(source).toContain('if (viewport.width === 375) {');
  });

  it("runs marker transform regression only on the desktop representative", () => {
    expect(isProductionGateMarkerSmokeViewport({ width: 821, height: 1000 })).toBe(true);
    expect(isProductionGateMarkerSmokeViewport({ width: 375, height: 812 })).toBe(false);
    expect(isProductionGateMarkerSmokeViewport({ width: 1920, height: 1080 })).toBe(false);

    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("if (markerSmoke) {");
    expect(source).toContain("for (const zoom of [4, 8, 12])");
    expect(source).toContain("for (const delta of [[200, 100], [-200, -100]])");
    expect(source).toContain("for (const bearing of [90, 180])");
  });

  it("limits expensive browser interaction smoke to representative responsive families", () => {
    expect(isProductionGateFullSmokeViewport({ width: 375, height: 812 })).toBe(true);
    expect(isProductionGateFullSmokeViewport({ width: 821, height: 1000 })).toBe(true);
    for (const width of [320, 360, 390, 430, 768, 820, 899, 900, 901, 1024, 1099, 1100, 1101, 1200, 1280, 1440, 1920]) {
      expect(isProductionGateFullSmokeViewport({ width, height: 900 })).toBe(false);
    }

    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain("if (markerSmoke) {");
    expect(source).toContain("if (fullSmoke && viewport.width >= 821) {");
  });

  it("waits for the closed drawer visibility transition before responsive assertions", () => {
    const source = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");
    expect(source).toContain('getComputedStyle(sidebar).visibility === "hidden"');
    expect(source).toContain("drawer-closed intentionally delays visibility:hidden");
  });

});
