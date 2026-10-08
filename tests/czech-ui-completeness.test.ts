import { readFileSync } from "node:fs";
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
    expect(cs.recap.weatherHighlights).toBe("Významné meteorologické jevy");
    expect(cs.aircraft.showFlightHistory).toBe("Zobrazit historii letu");
    expect(cs.browse.networkRouteFlow(2, 3)).toContain("2 příletů");
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

  it("renders Czech receiver coverage text including SVG and dynamic health", () => {
    const explorer = source("components/receiver-coverage-page.tsx");
    const polar = source("components/receiver-coverage-polar.tsx");
    const range = source("components/receiver-range-polar.tsx");

    expect(explorer).toContain('title="Analýza přijímače V2"');
    expect(explorer).toContain('title="Směrové zachycení oproti síti"');
    expect(explorer).toContain("healthStateLabel(intelligence.intelligenceV2.health.state)");
    expect(explorer).not.toContain("Loading receiver history");
    expect(explorer).not.toContain("Reliable sectors");
    expect(polar).toContain("Polární mapa pokrytí přijímače");
    expect(polar).toContain("Podíl zachycení");
    expect(polar).not.toContain("No coverage observations");
    expect(range).toContain("Směrový dosah");
    expect(range).not.toContain("Directional receiver range");
  });

  it("keeps the Czech branches of feature-local dictionaries readable", () => {
    const expected = new Map([
      ["components/aviation-event-feed.tsx", 'title: "Přehled leteckých událostí"'],
      ["components/saved-workspaces.tsx", 'title: "Uložená pracoviště"'],
      ["components/navigation-integrity-center.tsx", 'title: "Integrita navigačních dat"'],
      ["components/weather-operations-center.tsx", 'title: "Provozní přehled počasí"'],
      ["components/route-network-explorer.tsx", 'routeNetwork: "Síť tras"'],
      ["components/traffic-geography.tsx", 'title: "Geografie provozu"'],
      ["components/flight-compare.tsx", 'distance: "Délka zaznamenané stopy"'],
      ["components/airport-compare.tsx", 'title: "Porovnání letišť"'],
      ["components/aircraft-discovery.tsx", 'sourceUnavailable: "Údaje o objevovaných letadlech jsou dočasně nedostupné."'],
      ["components/aircraft-type-explorer.tsx", 'title: "Typy letadel"'],
      ["components/operator-explorer.tsx", 'topAirline: "Nejčastější společnost"'],
      ["components/flight-intelligence-analytics.tsx", 'title: "Analýza událostí letů"'],
    ]);

    for (const [path, expectedLabel] of expected) {
      expect(czechCopy(path), path).toContain(expectedLabel);
    }
    expect(source("components/command-palette.tsx")).toContain("Moje obloha, fotografické příležitosti a uložená místa");
    expect(source("components/airradar-shell.tsx")).toContain("Historické referenční hodnoty");
  });
});
