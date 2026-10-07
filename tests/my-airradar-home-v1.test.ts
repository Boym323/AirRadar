import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("My AirRadar Home V1", () => {
  const component = readFileSync(new URL("../components/my-airradar-home.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/airradar-shell.tsx", import.meta.url), "utf8");

  it("aggregates existing canonical surfaces without a new intelligence backend", () => {
    expect(component).toContain('activeCoverage: "local"');
    expect(component).toContain('fetch("/api/watchlist"');
    expect(component).toContain('fetch("/api/alerts?page=0&pageSize=8"');
    expect(component).toContain('fetch("/api/admin/spotter/saved-spots"');
    expect(component).toContain('"/operations?period=24h"');
    expect(component).not.toContain("new EventSource");
    expect(component).not.toContain("/api/my-airradar");
  });

  it("keeps exact observer location out of the personal home", () => {
    expect(component).not.toContain("navigator.geolocation");
    expect(component).not.toContain("centerLat");
    expect(component).not.toContain("centerLon");
    expect(component).toContain("SPOTTER_LOGBOOK_STORAGE_KEY");
  });

  it("surfaces the personal home in canonical desktop and mobile navigation", () => {
    const primary = shell.slice(shell.indexOf("const primaryNavigation"), shell.indexOf("const moreNavigation"));
    const mobile = shell.slice(shell.indexOf("export function MobileBottomNav"), shell.indexOf("export function AirRadarPageShell"));
    expect(primary).toContain('href: "/my-airradar"');
    expect(mobile).toContain('item("/my-airradar"');
  });
});
