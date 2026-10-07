import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const paletteSource = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");
const searchRouteSource = readFileSync(new URL("../app/api/search/route.ts", import.meta.url), "utf8");

describe("Global Command Palette V1 boundary", () => {
  it("reuses the canonical global search endpoint with a bounded debounce", () => {
    expect(paletteSource).toContain("SEARCH_DEBOUNCE_MS = 220");
    expect(paletteSource).toContain("/api/search?q=");
    expect(paletteSource.match(/fetch\(/g)).toHaveLength(1);
    expect(searchRouteSource).toContain("searchGlobal");
  });

  it("exposes the current product surfaces without inventing routes", () => {
    for (const href of [
      'href: "/"',
      'href: "/airports"',
      'href: "/routes"',
      'href: "/discover"',
      'href: "/weather"',
      'href: "/airspace"',
      'href: "/operations"',
      'href: "/time-machine"',
      'href: "/compare/flights"',
      'href: "/compare/airports"',
      'href: "/navigation-integrity"',
      'href: "/statistics"',
      'href: "/system"',
    ]) expect(paletteSource).toContain(href);
  });

  it("keeps keyboard navigation and traps focus inside the modal", () => {
    expect(paletteSource).toContain("event.metaKey");
    expect(paletteSource).toContain("event.ctrlKey");
    expect(paletteSource).toContain('event.key === "ArrowDown"');
    expect(paletteSource).toContain('event.key === "ArrowUp"');
    expect(paletteSource).toContain('event.key === "Enter"');
    expect(paletteSource).toContain('event.key !== "Tab"');
    expect(paletteSource).toContain("dialogRef.current?.querySelectorAll");
    expect(paletteSource).toContain("last.focus()");
    expect(paletteSource).toContain("first.focus()");
  });

  it("does not add a second search backend", () => {
    expect(paletteSource).not.toContain("/api/command");
    expect(paletteSource).not.toContain("/api/global-search");
  });
});
