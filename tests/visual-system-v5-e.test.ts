import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatAircraftManufacturerModel } from "@/lib/aircraft/display-name";
import { airportMovementAnalyticsText } from "@/lib/i18n/airport-movement-analytics";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Visual System V5-E: language, identity and map credits", () => {
  const aircraftV2 = read("components/aircraft-detail-v2.tsx");
  const aircraftV3 = read("components/aircraft-detail-v3.tsx");
  const movementAnalytics = read("components/airport-movement-analytics.tsx");
  const movementCss = read("components/airport-movement-analytics.module.css");
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
    for (const view of [aircraftV2, aircraftV3]) {
      expect(view).toContain("formatAircraftManufacturerModel(manufacturer, model)");
      expect(view).not.toContain('[manufacturer, model].filter(Boolean).join(" ")');
    }
  });

  it("keeps airport movement analytics fully translated in CS/EN", () => {
    const cs = airportMovementAnalyticsText("cs-CZ");
    const en = airportMovementAnalyticsText("en-US");
    expect(cs.title).toBe("Analýza pohybů letadel");
    expect(cs.runwayUsage).toContain("drah");
    expect(cs.movementsUnit).toBe("pozorovaných pohybů");
    expect(cs.today).toBe("Dnes");
    expect(en.title).toBe("Aircraft movement analytics");
    expect(en.movementsUnit).toBe("observed movements");
    expect(movementAnalytics).toContain("airportMovementAnalyticsText(t.locale)");
    expect(movementAnalytics).toContain("copy.movementsUnit");
    expect(movementAnalytics).toContain('item === "today" ? copy.today : item');
    expect(movementAnalytics).not.toContain('"Peak UTC hour"');
    expect(movementAnalytics).not.toContain('"Runway usage"');
  });

  it("uses semantic visual tokens in historical movement analytics", () => {
    expect(movementCss).toContain("var(--border-default)");
    expect(movementCss).toContain("var(--surface-card)");
    expect(movementCss).toContain("var(--font-size-2xs)");
    expect(movementCss).not.toContain("font-size: .58rem");
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
