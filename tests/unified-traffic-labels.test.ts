import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trafficMapLabelLines, trafficMapLabelText } from "@/lib/aircraft/map-labels";

const appSource = readFileSync(join(process.cwd(), "components/airradar-app.tsx"), "utf8");
const collisionControllerSource = readFileSync(join(process.cwd(), "lib/radar/aircraft-label-controller.ts"), "utf8");

describe("Unified Traffic Labels", () => {
  it("uses the same zoom/detail policy for non-ADS-B traffic", () => {
    const traffic = { identity: "OK-GLD", altitudeFt: 4250, speedKt: 62 };
    expect(trafficMapLabelLines(traffic, 5)).toBeNull();
    expect(trafficMapLabelLines(traffic, 7)).toEqual({ primary: "OK-GLD", secondary: null });
    expect(trafficMapLabelLines(traffic, 9)).toEqual({ primary: "OK-GLD", secondary: "4 250 ft" });
    expect(trafficMapLabelLines(traffic, 11)).toEqual({ primary: "OK-GLD", secondary: "4 250 ft · 62KT" });
    expect(trafficMapLabelText(traffic, 11)).toBe("OK-GLD\n4 250 ft · 62KT");
  });

  it("suppresses stale telemetry without changing the identity or zoom threshold", () => {
    const traffic = { identity: "GLIDER", altitudeFt: 1200, speedKt: 48 };
    expect(trafficMapLabelLines(traffic, 11, { suppressTelemetry: true })).toEqual({
      primary: "GLIDER",
      secondary: null,
    });
    expect(trafficMapLabelLines(traffic, 6)).toBeNull();
  });

  it("renders normal OGN labels through MapLibre in the ADS-B collision domain", () => {
    expect(appSource).toContain('const OGN_LABEL_SOURCE_ID = "ogn-traffic-labels"');
    expect(appSource).toContain('const OGN_LABEL_LAYER_ID = "ogn-traffic-labels-symbol"');
    expect(appSource).toContain("crossSourceCollisions: true");
    expect(appSource).toContain('minzoom: 6.5');
    expect(appSource).toContain('"text-allow-overlap": false');
    expect(appSource).toContain('"text-ignore-placement": false');
    expect(appSource).toContain("ognMapLabelFeature(target, mapZoom, target.id === selectedOgnId)");
  });

  it("keeps source provenance out of permanent map labels and only forces the selected OGN DOM label", () => {
    expect(appSource).toContain("const domLabel = selected ? (baseLabel ?? presentation.primaryLabel) : null");
    expect(appSource).not.toContain("[altitude, presentation.sourceLabel]");
    expect(appSource).toContain("additionalMarkers: ognMarkers");
    expect(collisionControllerSource).toContain('addMarkers("additional", input.additionalMarkers)');
  });
});
