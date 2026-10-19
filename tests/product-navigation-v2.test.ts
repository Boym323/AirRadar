import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Product Navigation V2", () => {
  const shell = readFileSync(new URL("../components/airradar-shell.tsx", import.meta.url), "utf8");
  const palette = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");

  it("keeps the remaining primary product workflows on desktop", () => {
    const primary = shell.slice(shell.indexOf("function primaryNavigation()"), shell.indexOf("function moreNavigationGroups()"));
    for (const href of ["/", "/airports", "/weather"]) {
      expect(primary).toContain('href: "' + href + '"');
    }
    expect(primary).not.toContain('href: "/statistics"');
    expect(primary).not.toContain('href: "/time-machine"');
  });

  it("lists only selected aviation and system destinations", () => {
    const grouped = shell.slice(shell.indexOf("function moreNavigationGroups()"), shell.indexOf("function MoreNavigationGroups("));
    for (const id of ["aviation", "system"]) expect(grouped).toContain(`id: "${id}"`);
    for (const href of ["/navigation", "/navigation-integrity", "/receiver/coverage", "/system"]) {
      expect(grouped).toContain(`href: "${href}"`);
    }
    for (const href of ["/watchlist", "/history", "/intelligence", "/airspace"]) {
      expect(grouped).not.toContain(`href: "${href}"`);
    }
  });

  it("keeps the primary mobile destinations", () => {
    const mobile = shell.slice(shell.indexOf("export function MobileBottomNav"), shell.indexOf("export function AirRadarPageShell"));
    expect(mobile).toContain('item("/",');
    expect(mobile).toContain('item("/weather"');
    expect(mobile).toContain('item("/airports"');
    expect(mobile).toContain('item("/navigation-integrity"');
    expect(mobile.match(/item\("/g)).toHaveLength(4);
    expect(mobile).not.toContain('item("/statistics"');
    expect(mobile).not.toContain('item("/time-machine"');
  });

  it("provides aria-current in primary and overflow navigation", () => {
    expect(shell.match(/aria-current/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(shell).toContain('const attributes = { "aria-current": active ? "page" as const : undefined, className: active ? "active" : undefined };');
    expect(shell).toContain('<a key={href} href={href} {...attributes}>');
    expect(shell).toContain('<Link key={href} href={href} {...attributes}>');
  });

  it("keeps the command palette free of retired Spotter routes", () => {
    expect(palette).not.toContain("/spotter");
    expect(palette.match(/fetch\(/g)).toHaveLength(1);
  });
});
