import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const radar = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

describe("Rejected Operational Focus map callout", () => {
  it("does not mount a Digital Twin or Operational Focus map callout", () => {
    expect(radar).not.toContain("<RadarOperationalFocusCard");
    expect(radar).not.toContain("AIRCRAFT_OPERATIONAL_FOCUS_MAP_");
    expect(radar).not.toContain("OPERATIONAL_TWIN_MAP_SOURCE_ID");
    expect(radar).not.toContain("aircraftOperationalFocusRadarHref");
  });

  it("continues to render retained map overlays", () => {
    expect(radar).toContain("atc-sectors-context-highlight");
    expect(radar).toContain("showNavigationIntegrity");
    expect(radar).toContain("showAtsRoutes");
  });
});
