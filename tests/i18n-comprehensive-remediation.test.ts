import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTranslations } from "@/lib/i18n";
import { localizedPageMetadata } from "@/lib/i18n/page-metadata";
import {
  receiverCardinals, receiverCoveragePeriodLabel, receiverExplorerCopy,
  receiverPolarCellAria, receiverRangeChartAria, receiverRangeSectorAria,
} from "@/lib/i18n/receiver-explorer";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Czech/English full-site localization remediation", () => {
  it("uses one persistent locale for system, watchlist, fleets and alerts", () => {
    for (const path of [
      "components/system-status-page.tsx",
      "components/watchlist-page.tsx",
      "components/fleet-page.tsx",
      "components/alert-history-page.tsx",
    ]) {
      const component = source(path);
      expect(component, path).toContain("useLocale()");
      expect(component, path).toContain("getTranslations(locale)");
      expect(component, path).not.toContain('useState<LocaleKey>("cs")');
      expect(component, path).not.toContain('className="language-button"');
    }
    expect(source("components/airradar-shell.tsx")).toContain('data-testid="language-switch"');
  });

  it("covers receiver error, loading and no-data states in both languages", () => {
    const cs = receiverExplorerCopy("cs");
    const en = receiverExplorerCopy("en");
    expect(cs.headerTitle).toBe("Analýza přijímače V2");
    expect(en.headerTitle).toBe("Receiver Analysis V2");
    expect(cs.profileEmpty).toBe("Chybí údaje o směrovém dosahu");
    expect(en.profileEmpty).toBe("No directional range data");
    expect(cs.referenceUnavailable).toBe("Referenční zachycení není dostupné");
    expect(en.referenceUnavailable).toBe("Reference capture unavailable");
    expect(cs.loadingHistory).toContain("Načítání");
    expect(en.loadingHistory).toContain("Loading");
    expect(cs.noData).toBe("Bez dat");
    expect(en.noData).toBe("No data");
    const explorer = source("components/receiver-coverage-page.tsx");
    expect(explorer).toContain("copy.referenceUnavailable");
    expect(explorer).toContain("copy.loadingHistory");
    expect(explorer).toContain("copy.profileEmpty");
    expect(explorer).not.toContain('title="Analýza přijímače V2"');
    expect(explorer).toContain("receiverExplorerCopy(t.locale)");
  });

  it("updates chart legends, compass directions and accessible descriptions", () => {
    expect(receiverCardinals("cs")).toEqual(["S", "V", "J", "Z"]);
    expect(receiverCardinals("en")).toEqual(["N", "E", "S", "W"]);
    expect(receiverCoveragePeriodLabel("7d", "cs")).toBe("7 dní");
    expect(receiverCoveragePeriodLabel("7d", "en")).toBe("7 days");
    expect(receiverRangeChartAria("en", 30)).toContain("30 days");
    expect(receiverRangeSectorAria("cs", 0, 10, "10 km", "12 km", "15 km")).toContain("stupňů");
    expect(receiverPolarCellAria("en", 0, 10, 0, 25, 2, 10, "20 %")).toContain("captured 2 of 10");
    expect(source("components/receiver-range-polar.tsx")).toContain("receiverRangeSectorAria");
    expect(source("components/receiver-coverage-polar.tsx")).toContain("receiverPolarCellAria");
  });

  it("maintains both languages for client-side heatmap and server-fed intelligence", () => {
    const heatmap = source("components/heatmap-page-content.tsx");
    const intelligence = source("components/intelligence-page-content.tsx");
    expect(heatmap).toContain("pageExtrasCopy(t.locale).heatmap");
    expect(intelligence).toContain("pageExtrasCopy(t.locale).intelligence");
    expect(intelligence).toContain("t.intelligence.types[event.type]");
    expect(source("app/intelligence/page.tsx")).toContain("getFlightIntelligenceService().query({ limit: 50 })");
    expect(source("app/intelligence/page.tsx")).toContain("<IntelligencePageContent events={events}");
  });

  it("keeps document metadata aligned with the selected language", () => {
    expect(localizedPageMetadata("/system", "en").title).toBe("System Status — AirRadar");
    expect(localizedPageMetadata("/system", "cs").title).toBe("Stav systému — AirRadar");
    expect(localizedPageMetadata("/heatmap", "en").title).toBe("Traffic Heatmap — AirRadar");
    expect(localizedPageMetadata("/receiver/coverage", "en").title).toBe("Receiver Coverage — AirRadar");
    expect(localizedPageMetadata("/aircraft/ABC123", "en").title).toBeNull();
    const provider = source("components/locale-provider.tsx");
    expect(provider).toContain("localizedPageMetadata(pathname");
    expect(provider).toContain("document.title = metadata.title");
    expect(provider).toContain('meta[name="description"]');
    expect(getTranslations("en").system.pageTitle).toBe("System status");
    expect(getTranslations("cs").system.pageTitle).toBe("Stav systému");
  });

  it("reuses a real system snapshot for desktop and mobile predictive visual fixtures", () => {
    const gates = source("scripts/production-gates.mjs");
    expect(gates).toContain("let systemStatusSnapshot = null;");
    expect(gates).toContain('target.name === "system-desktop"');
    expect(gates).toContain("if (upstream.ok()) systemStatusSnapshot = await upstream.json()");
    expect(gates).toContain('visualPage.locator(".system-grid").waitFor');
    expect(gates).toContain('JSON.stringify({ ...systemStatusSnapshot, detailLevel: "admin" })');
    expect(gates).toContain("Predictive visual smoke requires a successful real system status snapshot");
  });

  it("translates comparison, alert event titles and map layer names without changing data IDs", () => {
    const compare = source("components/airport-compare.tsx");
    const notifications = source("components/notification-center.tsx");
    const layers = source("components/radar/radar-map-layer-menu.tsx");
    expect(compare).toContain('cs ? "Chybí údaje o využití drah" : "No runway sample"');
    expect(notifications).toContain('cs ? "Rekord příjmu" : "Reception record"');
    expect(notifications).toContain("t.intelligence.types[label as keyof typeof t.intelligence.types]");
    expect(layers).toContain('t.locale.startsWith("cs") ? "Počasí z letadel" : "Aircraft Weather"');
    expect(layers).toContain("data-testid");
  });
});
