import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Visual refinement C: statistics and operational dashboards", () => {
  it("does not reserve a full viewport for a failed receiver statistics page", () => {
    const css = source("app/globals.css");
    expect(css).toContain(".secondary-page-content > .statistics-page {\n  min-height: 0;");
    expect(css).toContain(".secondary-page-content > .statistics-page:has(.statistics-error)");
    expect(css).toContain('.statistics-card[data-state="unavailable"]');
    expect(css).toContain(".statistics-export-button:disabled");
  });
  it("removes duplicate system back navigation while keeping access to the radar", () => {
    const system = source("components/system-status-page.tsx");
    expect(system).toContain('<Link className="back-link" href="/">');
    const nav = system.split("function LinkNav")[1].split("export function SystemStatusPage")[0];
    expect(nav).not.toContain('href="/"');
    expect(nav).toContain('href="/statistics"');
  });
  it("renders long wind metrics without truncation on mobile", () => {
    const airport = source("components/airport-operations-board.tsx");
    const css = source("app/globals.css");
    expect(airport).toContain('className="airport-v3-wind-metric"');
    expect(css).toContain(".airport-v3-wind-metric .ui-metric-value");
    expect(css).toContain("white-space: normal;");
    expect(css).toContain(".airport-v3-metrics .airport-v3-wind-metric");
  });
  it("keeps receiver navigation localized and missing-data cards compact", () => {
    const stats = source("app/statistics/page.tsx");
    const traffic = source("components/statistics-traffic-intelligence.tsx");
    const heatmap = source("components/statistics-heatmap.tsx");
    expect(stats).toContain('href="/receiver/coverage">{t.statistics.coverage}');
    expect(traffic).toContain('data-state={unavailable ? "unavailable"');
    expect(heatmap).toContain('data-state={unavailable ? "unavailable"');
  });
});
