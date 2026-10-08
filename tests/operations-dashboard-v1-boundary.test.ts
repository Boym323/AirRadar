import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("../app/operations/page.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../components/operations-dashboard.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../components/airradar-shell.tsx", import.meta.url), "utf8");
const csSource = readFileSync(new URL("../lib/i18n/cs.ts", import.meta.url), "utf8");
const registry = JSON.parse(
  readFileSync(new URL("../docs/features.registry.json", import.meta.url), "utf8"),
) as { features: Array<{ id: string; pages: string[]; apis: string[] }> };

describe("Operations Dashboard V1 boundary", () => {
  it("owns /operations as a thin presentation route", () => {
    expect(pageSource).toContain('import { OperationsDashboard } from "@/components/operations-dashboard"');
    expect(pageSource).toContain("<OperationsDashboard />");
    expect(shellSource).toContain('{ href: "/operations", label: t.operations.title }');
    expect(registry.features.find((feature) => feature.id === "operations-dashboard")).toMatchObject({
      pages: ["/operations"],
      apis: [],
    });
  });

  it("reuses canonical live, airport, regional, predictive and intelligence boundaries", () => {
    expect(dashboardSource).toContain('new EventSource("/api/stream?coverage=local")');
    expect(dashboardSource).toContain('fetch("/api/operations/situation"');
    expect(dashboardSource).toContain('"/api/operations/predictive?hexes="');
    expect(dashboardSource).toContain('fetch("/api/intelligence/events?limit=20"');
    expect(dashboardSource).toContain('"/api/airports/" + encodeURIComponent(icao) + "/operations?period=24h"');
    expect(dashboardSource).not.toContain("getPrisma");
    expect(dashboardSource).not.toContain("getAircraftStateService");
  });

  it("keeps Next 30 Minutes readiness-safe and bounded", () => {
    expect(dashboardSource).toContain("item.etaAdvisory.horizonMinutes <= 30");
    expect(dashboardSource).toContain("operations.terminalDemandHorizon?.items");
    expect(dashboardSource).toContain("item.etaMinutes <= 30");
    expect(dashboardSource).toContain('<ContextBadge variant="inferred">{t.operations.inferred}</ContextBadge>');
    expect(dashboardSource).toContain(".slice(0, 6)");
    expect(dashboardSource).toContain(".slice(0, 4)");
    expect(csSource).toContain("Veřejný odhad příletu není dostupný");
  });

  it("exposes the four V1 product blocks plus live traffic and the safety disclaimer", () => {
    for (const testId of [
      "operations-live-traffic",
      "operations-airport-flow",
      "operations-next-30",
      "operations-attention",
      "operations-notable-events",
    ]) {
      expect(dashboardSource).toContain('data-testid="' + testId + '"');
    }
    expect(csSource).toContain("nejde o výstrahu před srážkou ani o podklad pro rozstupy mezi letadly");
  });
});
