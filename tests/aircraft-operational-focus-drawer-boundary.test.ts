import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("../components/radar/radar-drawer-details.tsx", import.meta.url), "utf8");
const quickDetailSource = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../components/radar/radar-operational-focus-summary.tsx", import.meta.url), "utf8");
const enSource = readFileSync(new URL("../lib/i18n/en.ts", import.meta.url), "utf8");
const csSource = readFileSync(new URL("../lib/i18n/cs.ts", import.meta.url), "utf8");

describe("Aircraft Operational Focus drawer V1 boundary", () => {
  it("reuses the selected Operational Twin response without adding another request", () => {
    expect(appSource).toContain("operationalTwin={selectedOperationalTwin}");
    expect(drawerSource).toContain("operationalTwin={operationalTwin}");
    expect(quickDetailSource).toContain('operationalTwin?.status === "available"');
    expect(quickDetailSource).toContain("operationalTwin.operationalFocus ?? null");
    expect(summarySource).not.toContain("fetch(");
  });

  it("fails closed across aircraft switches", () => {
    expect(quickDetailSource).toContain("operationalTwin.aircraft.icaoHex.toUpperCase() === aircraft.icaoHex.toUpperCase()");
  });

  it("focuses an existing item through the same radar query contract", () => {
    expect(appSource).toContain("aircraftOperationalFocusRadarHref(selectedAircraft.icaoHex, itemId)");
    expect(appSource).toContain("operationalFocusItemId={operationalFocusMapId}");
    expect(summarySource).toContain("onClick={() => onFocus(item.id)}");
    expect(summarySource).toContain('data-testid="aircraft-operational-focus-drawer"');
  });

  it("keeps the drawer compact and bounded", () => {
    expect(summarySource).toContain("focus.items.slice(0, 4)");
    expect(summarySource).toContain("operationalFocusDrawerMore");
  });

  it("keeps matching EN/CS interaction copy", () => {
    for (const source of [enSource, csSource]) {
      expect(source).toContain("operationalFocusDrawerMapAction");
      expect(source).toContain("operationalFocusDrawerActive");
      expect(source).toContain("operationalFocusDrawerMore");
    }
  });
});
