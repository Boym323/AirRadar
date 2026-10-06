import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("../components/radar/radar-drawer-details.tsx", import.meta.url), "utf8");
const quickDetailSource = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../components/radar/radar-operational-focus-summary.tsx", import.meta.url), "utf8");

describe("Aircraft Operational Focus map ↔ drawer sync V1 boundary", () => {
  it("registers map-click reveal handlers only on the existing focus layers", () => {
    expect(appSource).toContain("const revealOperationalFocusFromMap");
    expect(appSource).toContain('map.on("click", layer, revealOperationalFocusFromMap)');
    expect(appSource).toContain("AIRCRAFT_OPERATIONAL_FOCUS_MAP_LINE_LAYER_ID");
    expect(appSource).toContain("AIRCRAFT_OPERATIONAL_FOCUS_MAP_POINT_LAYER_ID");
    expect(appSource).toContain("setOperationalFocusRevealVersion((value) => value + 1)");
  });

  it("keeps the canonical aircraft + focus URL contract on map click", () => {
    expect(appSource).toContain("aircraftOperationalFocusRadarHref(hex, itemId)");
    expect(appSource).toContain("const hex = selectedHexRef.current");
  });

  it("reveals the Situation tab for URL focus and repeated map clicks", () => {
    expect(drawerSource).toContain("operationalFocusRevealVersion={operationalFocusRevealVersion}");
    expect(quickDetailSource).toContain("operationalFocusRevealVersion = 0");
    expect(quickDetailSource).toContain('setActiveTab("situation")');
    expect(quickDetailSource).toContain("[operationalFocusItemId, operationalFocusRevealVersion]");
  });

  it("always keeps the active focus item inside the compact four-row summary", () => {
    expect(summarySource).toContain("focus.items.find((item) => item.id === activeItemId)");
    expect(summarySource).toContain("firstItems.slice(0, 3), activeItem");
    expect(summarySource).toContain("focus.items.slice(0, 4)");
  });

  it("does not add another data request for map-to-drawer synchronization", () => {
    expect(summarySource).not.toContain("fetch(");
    expect(quickDetailSource).not.toContain("/situation");
  });
});
