import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Product Navigation V2", () => {
  const shell = readFileSync(new URL("../components/airradar-shell.tsx", import.meta.url), "utf8");
  const palette = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");

  it("promotes the primary product workflows on desktop", () => {
    const primary = shell.slice(shell.indexOf("const primaryNavigation"), shell.indexOf("const moreNavigation"));
    for (const href of ["/my-airradar", "/", "/spotter", "/events", "/airports", "/journeys"]) {
      expect(primary).toContain('href: "' + href + '"');
    }
    expect(primary).not.toContain('href: "/statistics"');
    expect(primary).not.toContain('href: "/time-machine"');
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
    expect(shell).toContain('className={active ? "active" : undefined}');
  });

  it("makes every new workflow reachable from the existing command palette", () => {
    for (const href of ["/my-airradar", "/spotter", "/events", "/journeys", "/baselines"]) {
      expect(palette).toContain('href: "' + href + '"');
    }
    expect(palette.match(/fetch\(/g)).toHaveLength(1);
  });
});
