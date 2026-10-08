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

  it("keeps production smoke expectations synchronized with Czech user-facing labels", () => {
    const gates = source("scripts/production-gates.mjs");
    const cs = getTranslations();
    for (const copy of [
      cs.system.predictiveRolloutStateLabels.SHADOW_COLLECTING,
      cs.system.predictiveRolloutStateLabels.READY_FOR_PUBLIC_CONFIG,
      cs.system.predictiveCalibrationPhaseLabels.READY,
      cs.system.predictiveCalibrationPhaseLabels.COLLECTING,
      cs.system.predictiveCalibrationPhaseLabels.TRUTH_BLOCKED,
      cs.aircraft.predictiveAdminPreview,
    ]) {
      expect(gates, copy).toContain(JSON.stringify(copy));
    }
    expect(gates).not.toContain("SHADOW · sbírání evidence");
    expect(gates).not.toContain("ADMIN · SHADOW PREVIEW");
  });

  it("localizes alert analytics and delivery health dashboards without dropping English support", () => {
    const analytics = source("components/alert-effectiveness-analytics-page.tsx");
    const delivery = source("components/delivery-health-page.tsx");

    for (const component of [analytics, delivery]) {
      expect(component).toContain('t.locale.startsWith("cs") ? {');
      expect(component).toContain("copy.kicker");
      expect(component).toContain("copy.title");
      expect(component).toContain("copy.unavailable");
    }

    expect(analytics).toContain('title: "Analýza účinnosti upozornění"');
    expect(analytics).toContain('noisiest: "Nejčastěji aktivovaná pravidla"');
    expect(analytics).toContain('title: "Alert Effectiveness Analytics"');
    expect(delivery).toContain('title: "Stav doručování upozornění"');
    expect(delivery).toContain('queueDepth: "Ve frontě"');
    expect(delivery).toContain('title: "Delivery Health"');
    expect(delivery).toContain("data.status === \"DEGRADED\" ? copy.degraded : copy.disabled");
    expect(analytics).not.toContain('<MetricCard value={data.sent} label="Delivered"');
    expect(delivery).not.toContain('<MetricCard value={data.durable.queueDepth} label="Queue depth"');
  });

  it("localizes alert rule simulation while keeping rule identifiers unchanged", () => {
    const simulator = source("components/alert-rule-simulator-page.tsx");
    expect(simulator).toContain('title: "Simulátor pravidel upozornění"');
    expect(simulator).toContain('flightEvent: "Letová událost"');
    expect(simulator).toContain('match: "SHODA"');
    expect(simulator).toContain("copy.actionableRules(result.matchedRuleIds.length)");
    expect(simulator).toContain('<option value="GEOFENCE_ENTER">{copy.geofenceEnter}</option>');
    expect(simulator).toContain('title: "Alert Rule Simulator"');
    expect(simulator).not.toContain('<button className="primary-button" type="submit">Simulate</button>');
  });

  it("keeps historical baselines and predictive explanations readable in Czech", () => {
    const baseline = source("components/historical-baselines.tsx");
    const predictive = source("components/predictive-aircraft-advisories.tsx");

    expect(baseline).toContain('title: "Historické referenční hodnoty"');
    expect(baseline).toContain('medianKicker: "MEDIÁN ZA 30 DNÍ"');
    expect(baseline).toContain("kicker={copy.medianKicker}");
    expect(predictive).toContain('subtitle: "Podklady použité hlavním predikčním modelem"');
    expect(predictive).toContain('adminGate: "Administrátorský náhled"');
    expect(predictive).toContain('readiness: "Důvody hodnocení připravenosti"');
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
