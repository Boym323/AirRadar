import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync(
  new URL("../components/radar/radar-operational-focus-card.tsx", import.meta.url),
  "utf8",
);
const radarSource = readFileSync(
  new URL("../components/airradar-app.tsx", import.meta.url),
  "utf8",
);
const enSource = readFileSync(new URL("../lib/i18n/en.ts", import.meta.url), "utf8");
const csSource = readFileSync(new URL("../lib/i18n/cs.ts", import.meta.url), "utf8");

describe("Aircraft Operational Focus map callout V1.1 boundary", () => {
  it("renders only from the existing selected Operational Twin response", () => {
    expect(radarSource).toContain("activeOperationalFocusItem");
    expect(radarSource).toContain("selectedOperationalTwin?.status !== \"available\"");
    expect(radarSource).toContain("selectedOperationalTwin.operationalFocus?.items.find");
    expect(radarSource).toContain("<RadarOperationalFocusCard");
    expect(cardSource).not.toContain("fetch(");
  });

  it("keeps clear-focus navigation bounded to the same aircraft", () => {
    expect(radarSource).toContain("aircraftOperationalFocusClearHref(aircraftFocus)");
    expect(radarSource).toContain("router.replace");
    expect(cardSource).toContain("onClear={onClear}");
    expect(cardSource).toContain('data-testid="radar-operational-focus-card"');
  });

  it("preserves context-only safety wording in both locales", () => {
    for (const source of [enSource, csSource]) {
      expect(source).toContain("operationalFocusMapFocused");
      expect(source).toContain("operationalFocusMapClear");
      expect(source).toContain("operationalFocusMapDisclaimer");
    }
    expect(enSource).toContain("not a safety alert");
    expect(csSource).toContain("nejde o bezpečnostní výstrahu");
  });
});
