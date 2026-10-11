import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../components/system-runtime-timeline.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("../components/route-enrichment-panel.tsx", import.meta.url), "utf8");
const integrations = readFileSync(new URL("../components/system-integration-diagnostics.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("System status audit UX", () => {
  it("prioritizes reception and routes before advanced runtime details", () => {
    expect(page.indexOf('<SystemSection id="system-reception"')).toBeLessThan(page.indexOf('<SystemSection id="system-data"'));
    expect(page.indexOf('<SystemSection id="system-data"')).toBeLessThan(page.indexOf('<SystemSection id="system-runtime"'));
    expect(page).toContain('Základní dostupnost služeb');
    expect(page).toContain('neúspěšné dávky za 24 hodin');
  });
  it("refresh button also refreshes the integration and runtime panels", () => {
    expect(page).toContain("setRefreshKey((k) => k + 1)");
    expect(page).toContain('<SystemIntegrationDiagnostics key={refreshKey}');
    expect(page).toContain('refreshKey={refreshKey}');
    expect(timeline).toContain("}, [refreshKey]);");
  });
  it("keeps timelines short and translates operational states", () => {
    expect(timeline).toContain("events.slice(0, 7)");
    expect(timeline).toContain("Časová osa systému a přijímače");
    expect(timeline).toContain("Souběžná změna stavů příjmu");
    expect(timeline).not.toContain('title: "System & Receiver Timeline",\n    subtitle: "Admin-only runtime historie');
  });
  it("groups source diagnostics under meaningful headings", () => {
    expect(integrations).toContain('RXW ACARS / FPN');
    expect(integrations).toContain('Trasy a databázová cache');
    expect(integrations).toContain('system-integration-groups');
    expect(styles).toContain('.system-page .system-integration-group.routes');
  });
  it("groups route counters and uses browser local time for graph labels", () => {
    expect(routes).toContain("metricGroups");
    expect(routes).toContain("Paměťová cache");
    expect(routes).toContain("Externí dotazy");
    expect(routes).toContain("Za posledních 24 hodin selhalo všech");
    expect(routes).not.toContain('timeZone: "UTC"');
    expect(styles).toContain(".system-page .system-integrations-diagnostics .system-fields");
  });
});
