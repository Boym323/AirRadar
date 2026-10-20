import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("Rejected Digital Twin map layer boundary", () => {
  it("unregisters all forecast map sources, event handlers and legend", () => {
    const radar = read("components/airradar-app.tsx");
    expect(radar).not.toContain("OPERATIONAL_TWIN_");
    expect(radar).not.toContain("createOperationalTwinMapGeoJSON");
    expect(radar).not.toContain("openOperationalTwinMapEvent");
    expect(radar).not.toContain("operational-twin-map-legend");
    expect(radar).not.toContain("AIRCRAFT_OPERATIONAL_FOCUS_MAP_");
  });

  it("keeps selected-traffic and Navigation Integrity layers", () => {
    const radar = read("components/airradar-app.tsx");
    expect(radar).toContain("map.addSource(\"selected-trail\"");
    expect(radar).toContain("showNavigationIntegrity");
    expect(radar).toContain("useRadarAircraftContext");
  });
});
