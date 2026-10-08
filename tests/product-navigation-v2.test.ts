import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Product Navigation V2", () => {
  const shell = readFileSync(new URL("../components/airradar-shell.tsx", import.meta.url), "utf8");
  const palette = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");

  it("promotes the primary product workflows on desktop", () => {
    const primary = shell.slice(shell.indexOf("function primaryNavigation()"), shell.indexOf("function moreNavigationGroups()"));
    for (const href of ["/my-airradar", "/", "/spotter", "/events", "/airports", "/journeys"]) {
      expect(primary).toContain('href: "' + href + '"');
    }
    expect(primary).not.toContain('href: "/statistics"');
    expect(primary).not.toContain('href: "/time-machine"');
  });

  it("preserves all 19 overflow routes in localized thematic groups", () => {
    const grouped = shell.slice(shell.indexOf("function moreNavigationGroups()"), shell.indexOf("function MoreNavigationGroups("));
    for (const id of ["operations", "history", "aviation", "system"]) {
      expect(grouped).toContain(`id: "${id}"`);
    }
    for (const href of [
      "/operations", "/airspace", "/weather", "/watchlist", "/alerts",
      "/notifications", "/workspaces", "/history", "/time-machine",
      "/statistics", "/baselines", "/recap/daily", "/recap/weekly",
      "/intelligence", "/fleet", "/routes", "/navigation", "/procedures", "/system",
    ]) {
      expect(grouped).toContain(`href: "${href}"`);
    }
    expect(grouped.match(/\\{ href: "\\/[^"]+", label:/g)).toHaveLength(19);
    expect(grouped).toContain('label: cs ? "Provoz a radar" : "Operations & radar"');
    expect(grouped).toContain('label: cs ? "Historie a analýza" : "History & analysis"');
    expect(grouped).toContain('label: cs ? "Letecká data" : "Aviation data"');
    expect(grouped).toContain('label: cs ? "Systém" : "System"');
  });

  it("uses My AirRadar, Radar, Spotter and Events as the mobile bottom destinations", () => {
    const mobile = shell.slice(shell.indexOf("export function MobileBottomNav"), shell.indexOf("export function AirRadarPageShell"));
    expect(mobile).toContain('item("/my-airradar"');
    expect(mobile).toContain('item("/",');
    expect(mobile).toContain('item("/spotter"');
    expect(mobile).toContain('item("/events"');
    expect(mobile).not.toContain('item("/statistics"');
    expect(mobile).not.toContain('item("/time-machine"');
  });

  it("provides aria-current in primary and overflow navigation", () => {
    expect(shell.match(/aria-current/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(shell).toContain('const attributes = { "aria-current": active ? "page" as const : undefined, className: active ? "active" : undefined };');
    expect(shell).toContain('<a key={href} href={href} {...attributes}>');
    expect(shell).toContain('<Link key={href} href={href} {...attributes}>');
  });

  it("makes every new workflow reachable from the existing command palette", () => {
    for (const href of ["/my-airradar", "/spotter", "/events", "/journeys", "/baselines"]) {
      expect(palette).toContain('href: "' + href + '"');
    }
    expect(palette.match(/fetch\(/g)).toHaveLength(1);
  });
});
