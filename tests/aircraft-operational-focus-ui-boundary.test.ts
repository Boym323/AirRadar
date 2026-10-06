import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  new URL("../components/aircraft-operational-twin.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../components/aircraft-operational-twin.module.css", import.meta.url),
  "utf8",
);
const enSource = readFileSync(new URL("../lib/i18n/en.ts", import.meta.url), "utf8");
const csSource = readFileSync(new URL("../lib/i18n/cs.ts", import.meta.url), "utf8");
const radarSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

describe("Aircraft Operational Focus UI V1 boundary", () => {
  it("renders the server-computed focus without adding another data request", () => {
    expect(componentSource).toContain("const operationalFocus = data.operationalFocus ?? null");
    expect(componentSource).toContain('data-testid="aircraft-operational-focus-v1"');
    expect(componentSource).toContain("operationalFocus.items.map");
    expect(componentSource).toContain("operationalFocus.level");
    expect(componentSource.match(/fetch\(/g)).toHaveLength(1);
  });

  it("links each focus item to the existing live-radar Digital Twin projection", () => {
    expect(componentSource).toContain("aircraftOperationalFocusRadarHref(icaoHex, item.id)");
    expect(componentSource).toContain("operationalFocusMapAction");
    expect(radarSource).toContain("AIRCRAFT_OPERATIONAL_FOCUS_QUERY_PARAM");
    expect(radarSource).toContain("createAircraftOperationalFocusMapGeoJSON");
    expect(radarSource).toContain("resolveAircraftOperationalFocusMapTarget");
    expect(radarSource).not.toContain("/api/aircraft/${encodeURIComponent(aircraftFocus)}/situation");
  });

  it("keeps attention semantics explicit and neutral for NORMAL", () => {
    expect(styleSource).toContain('focusLevel[data-level="ATTENTION"]');
    expect(styleSource).toContain("color: var(--danger)");
    expect(styleSource).toContain('focusLevel[data-level="WATCH"]');
    expect(styleSource).toContain("color: var(--warning)");
    expect(styleSource).toContain("strong.focusLevel { color: var(--text-muted); }");
  });

  it("ships equivalent English and Czech no-all-clear copy", () => {
    for (const source of [enSource, csSource]) {
      expect(source).toContain("operationalFocusTitle");
      expect(source).toContain("operationalFocusLevel");
      expect(source).toContain("operationalFocusTypes");
      expect(source).toContain("operationalFocusDisclaimer");
    }
    expect(enSource).toContain("NORMAL is not an all-clear");
    expect(csSource).toContain("NORMAL neznamená all-clear");
  });
});
