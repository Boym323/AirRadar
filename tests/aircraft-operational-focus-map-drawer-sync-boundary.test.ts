import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("Rejected Operational Focus map/drawer sync", () => {
  it("has no map click handlers or deep-link focus selection", () => {
    const app = read("components/airradar-app.tsx");
    expect(app).not.toContain("revealOperationalFocusFromMap");
    expect(app).not.toContain("operationalFocusMapId");
    expect(app).not.toContain("operationalFocusRevealVersion");
    expect(app).toContain("selectedHexRef.current");
  });

  it("leaves the retained aircraft drawer independent of Operational Twin", () => {
    const quick = read("components/aircraft-radar-quick-detail.tsx");
    const drawer = read("components/radar/radar-drawer-details.tsx");
    expect(quick).not.toContain("RadarOperationalFocusSummary");
    expect(quick).not.toContain("operationalTwin");
    expect(drawer).not.toContain("operationalTwin");
    expect(quick).toContain("<NavigationIntegritySection");
    expect(quick).toContain("<SigmetSection");
  });
});
