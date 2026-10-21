import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTranslations } from "@/lib/i18n";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function czechCopy(path: string): string {
  const component = source(path);
  const start = component.indexOf("const copy = cs ? {");
  const end = component.indexOf("} : {", start);
  expect(start, `${path}: Czech copy block`).toBeGreaterThanOrEqual(0);
  expect(end, `${path}: English copy block`).toBeGreaterThan(start);
  return component.slice(start, end);
}

describe("Czech UI localization coverage", () => {
  it("keeps Czech as the HTML and translation default while preserving English", () => {
    expect(source("app/layout.tsx")).toContain('<html lang="cs"');
    const cs = getTranslations();
    const en = getTranslations("en");
    expect(cs.operations.title).toBe("Provozní přehled");
    expect(cs.operations.liveTrafficKicker).toBe("ŽIVÝ PROVOZ");
    expect(cs.commandSearch.title).toBe("Rychlé vyhledávání");
    expect(cs.commandSearch.liveRadar).toBe("Živý radar");
    expect(cs.aircraft.showFlightHistory).toBe("Zobrazit historii letu");
    expect(cs.browse.networkRouteFlow(2, 3)).toContain("2 přílety · 3 odlety");
    expect(cs.browse.networkRouteFlow(1, 5)).toContain("1 přílet · 5 odletů");
    expect(en.operations.title).toBe("Operations");
    expect(en.commandSearch.title).toBe("Command Search");
  });

  it("does not bring back known English-only Czech labels", () => {
    const dictionary = source("lib/i18n/cs.ts");
    for (const oldLabel of [
      'title: "Operations"',
      'liveTrafficKicker: "LIVE TRAFFIC"',
      'title: "Command Search"',
      'liveRadar: "Live Radar"',
      'weatherHighlights: "Weather highlights"',
      'networkKicker: "LIVE AIRPORT NETWORK"',
      'liveBoardV8Kicker: "Arrival Flow Intelligence"',
      'receiver: "Receiver"',
      'alerts: "Alerts"',
      'predictiveCoverage: "Coverage"',
    ]) {
      expect(dictionary, oldLabel).not.toContain(oldLabel);
    }
  });

  it("keeps operations, airport boards and prediction diagnostics in Czech", () => {
    const cs = getTranslations();
    expect(cs.operations.contextDisclaimer).toContain("nejde o výstrahu před srážkou");
    expect(cs.operations.attentionDescription).toContain("Regionální situace");
    expect(cs.airport.liveBoardV7ArrivalKicker).toBe("Pořadí příletů");
    expect(cs.airport.liveBoardV9Kicker).toBe("Výhled příletové poptávky");
    expect(cs.system.predictiveRolloutStateLabels.SHADOW_COLLECTING).toBe("EXPERIMENTÁLNÍ · sběr podkladů");
    expect(cs.system.predictiveRolloutStateLabels.READY_FOR_PUBLIC_CONFIG).toBe("Připraveno k veřejnému zapnutí");
    expect(cs.system.predictiveCalibrationPhaseLabels.READY).toBe("Připraveno ke kontrole");
    expect(cs.system.predictiveCalibrationPhaseLabels.TRUTH_BLOCKED).toBe("Blokováno nedostatkem ověření nebo měření");
    expect(cs.aircraft.predictiveAdminPreview).toBe("SPRÁVA · EXPERIMENTÁLNÍ NÁHLED");
  });

  it("keeps Czech weather smoke without retired prediction copy", () => {
    const gates = source("scripts/production-gates.mjs");
    expect(gates).toContain("Data nejsou aktuálně dostupná.");
    expect(gates).toContain("weather-data-desktop");
    expect(gates).toContain("weather-empty-mobile");
    expect(gates).not.toContain("predictiveReadinessFixture");
    expect(gates).not.toContain("SPRÁVA · EXPERIMENTÁLNÍ NÁHLED");
  });

  it("keeps localized delivery-health diagnostics but excludes retired alert administration", () => {
    const delivery = source("components/delivery-health-page.tsx");
    expect(delivery).toContain('t.locale.startsWith("cs") ? {');
    expect(delivery).toContain("copy.kicker");
    expect(delivery).toContain("copy.title");
    expect(delivery).toContain("copy.unavailable");
    expect(delivery).toContain('title: "Stav doručování upozornění"');
    expect(delivery).toContain('queueDepth: "Ve frontě"');
    expect(delivery).toContain('title: "Delivery Health"');
    for (const retired of [
      "components/alert-effectiveness-analytics-page.tsx",
      "components/alert-rule-simulator-page.tsx",
      "components/alerts-admin-page.tsx",
    ]) expect(existsSync(new URL(`../${retired}`, import.meta.url)), retired).toBe(false);
  });

  it("renders Czech receiver coverage text including SVG and dynamic health", () => {
    const explorer = source("components/receiver-coverage-page.tsx");
    const polar = source("components/receiver-coverage-polar.tsx");
    const range = source("components/receiver-range-polar.tsx");
    const translations = source("lib/i18n/receiver-explorer.ts");

    expect(explorer).toContain("title={copy.headerTitle}");
    expect(translations).toContain('headerTitle: "Analýza přijímače V2"');
    expect(translations).toContain('headerTitle: "Receiver Analysis V2"');
    expect(explorer).toContain("title={copy.referenceTitle}");
    expect(translations).toContain('referenceTitle: "Směrové zachycení oproti síti"');
    expect(explorer).toContain("healthStateLabel(intelligence.intelligenceV2.health.state)");
    expect(explorer).not.toContain("Loading receiver history");
    expect(explorer).not.toContain("Reliable sectors");
    expect(polar).toContain("copy.polarSvgTitle");
    expect(translations).toContain('polarSvgTitle: "Polární mapa pokrytí přijímače"');
    expect(polar).toContain("copy.captureShare");
    expect(translations).toContain('captureShare: "Podíl zachycení"');
    expect(polar).not.toContain("No coverage observations");
    expect(range).toContain("copy.rangeLegend");
    expect(translations).toContain('rangeLegend: "Směrový dosah"');
    expect(range).not.toContain("Directional receiver range");
  });

  it("keeps the Czech branches of feature-local dictionaries readable", () => {
    const expected = new Map([
      ["components/navigation-integrity-center.tsx", 'title: "Integrita navigačních dat"'],
      ["components/weather-operations-center.tsx", 'title: "Provozní přehled počasí"'],
    ]);

    for (const [path, expectedLabel] of expected) {
      expect(czechCopy(path), path).toContain(expectedLabel);
    }
  });
});
