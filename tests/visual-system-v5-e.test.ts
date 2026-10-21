import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatAircraftManufacturerModel } from "@/lib/aircraft/display-name";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Visual System V5-E: language, identity and map credits", () => {
  const aircraftV3 = read("components/aircraft-detail-v3.tsx");
  const css = read("app/globals.css");
  const gate = read("scripts/production-gates.mjs");
  const radar = read("components/airradar-app.tsx");

  it("formats a source-backed manufacturer and model exactly once", () => {
    expect(formatAircraftManufacturerModel("Airbus", "Airbus A380-800")).toBe("Airbus A380-800");
    expect(formatAircraftManufacturerModel("AIRBUS", "Airbus A380-800")).toBe("Airbus A380-800");
    expect(formatAircraftManufacturerModel("Boeing", "737 MAX 8")).toBe("Boeing 737 MAX 8");
    expect(formatAircraftManufacturerModel("Boeing", "Boeing 747-8")).toBe("Boeing 747-8");
    expect(formatAircraftManufacturerModel("Airbus", "Airbusan prototype")).toBe("Airbus Airbusan prototype");
    expect(formatAircraftManufacturerModel(null, "A380-800")).toBe("A380-800");
    expect(formatAircraftManufacturerModel("Airbus", null)).toBe("Airbus");
    expect(formatAircraftManufacturerModel(null, null)).toBeNull();
    expect(aircraftV3).toContain("formatAircraftManufacturerModel(manufacturer, model)");
    expect(aircraftV3).not.toContain('[manufacturer, model].filter(Boolean).join(" ")');
  });

  it("does not ship retired Airport Movement Analytics UI or translation module", () => {
    for (const removed of [
      "components/airport-movement-analytics.tsx",
      "components/airport-movement-analytics.module.css",
      "lib/i18n/airport-movement-analytics.ts",
    ]) expect(existsSync(new URL(`../${removed}`, import.meta.url)), removed).toBe(false);
  });

  it("keeps third-party MapLibre credit links accessible at narrow widths", () => {
    expect(radar).toContain("new maplibregl.AttributionControl({");
    expect(radar).toContain("customAttribution: airRadarMapAttributions(networkEnabled)");
    expect(css).toContain('@media (max-width: 420px)');
    expect(css).toContain(".radar-content .maplibregl-ctrl-attrib.maplibregl-compact-show");
    expect(css).toContain(".maplibregl-ctrl-attrib-inner");
    expect(css).not.toContain(".maplibregl-ctrl-attrib { display: none");
    expect(gate).toContain('"radar-mobile-320"');
    expect(gate).toContain('"aircraft-detail-desktop"');
  });
});
