import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

describe("V5-B1/B2 aircraft identity and progressive detail", () => {
  const quick = read("components/aircraft-radar-quick-detail.tsx");
  const css = read("app/radar-aircraft-panel.css");

  it("keeps the four live metrics and only known route endpoints", () => {
    expect(quick).toContain('<RadarTrafficHero');
    expect(quick).toContain('data-testid="aircraft-v5-identity"');
    expect(quick).toContain('data-completeness=');
    expect(quick).toContain('(route.origin || route.originAirport) && (route.destination || route.destinationAirport)');
    expect(quick).toContain('data-freshness={aircraft.seenPosSeconds');
    expect(css).toContain('.aircraft-quick-meta-type');
  });

  it("keeps primary operational context visible but progressively reveals deep detail", () => {
    const tab = quick.slice(quick.indexOf('id="aircraft-tabpanel-situation"'));
    expect(tab).toContain('<SituationSummarySection summary={situation} />');
    expect(tab).toContain('<AtcSection');
    expect(tab).toContain('<RouteWeatherSection');
    expect(tab).toContain('data-testid="aircraft-v5-advanced-context"');
    expect(tab.indexOf('<AtcSection')).toBeLessThan(tab.indexOf('<details className="aircraft-quick-deep-context"'));
    expect(tab.indexOf('<NavigationIntegritySection')).toBeGreaterThan(tab.indexOf('<summary>{t.aircraftQuickV5.advancedContext}</summary>'));
    expect(tab).toContain('<SigmetSection');
    expect(tab).toContain('<WindSection');
    expect(css).toContain('.aircraft-quick-deep-context > summary:focus-visible');
  });

  it("has Czech and English section labels", () => {
    for (const lang of ["cs","en"]) {
      const file = read(`lib/i18n/${lang}.ts`);
      expect(file).toContain("aircraftQuickV5: {");
      expect(file).toContain("advancedContext:");
    }
  });
});
