import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCommandSearchRecents } from "@/lib/search/command-palette";

describe("Universal Command Search V2", () => {
  const server = readFileSync(new URL("../lib/server/search.ts", import.meta.url), "utf8");
  const palette = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");
  const navigation = readFileSync(new URL("../components/navigation-reference-explorer.tsx", import.meta.url), "utf8");

  it("extends the canonical /api/search lane instead of adding another backend", () => {
    expect(server).toContain('kind: "ats-route" as const');
    expect(server).not.toContain('kind: "sector" as const');
    expect(server).not.toContain("getAtcData()");
    expect(palette).toContain("/api/search?q=");
    expect(palette.match(/fetch\(/g)).toHaveLength(1);
    expect(palette).not.toContain("/api/command");
    expect(palette).not.toContain("/api/global-search");
  });

  it("deep-links ATS routes and ATC sectors to canonical product surfaces", () => {
    expect(server).toContain('/navigation?route=');
    expect(server).not.toContain('/airspace/sectors/');
    expect(navigation).toContain("searchedRoute");
    expect(navigation).toContain("state.route");
  });

  it("keeps ATS route recents browser-local", () => {
    const parsed = parseCommandSearchRecents(JSON.stringify([
      { key: "ats-route:L984", kind: "ats-route", label: "L984", detail: "CZ", href: "/navigation?route=L984" },
    ]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.kind).toBe("ats-route");
  });
});
