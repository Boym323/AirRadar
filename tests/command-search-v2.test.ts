import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCommandSearchRecents } from "@/lib/search/command-palette";

const paletteSource = readFileSync(new URL("../components/command-palette.tsx", import.meta.url), "utf8");
const flightsBrowserSource = readFileSync(new URL("../components/airports-flights-browser.tsx", import.meta.url), "utf8");
const recapSource = readFileSync(new URL("../components/recap-page.tsx", import.meta.url), "utf8");
const airportBoardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");

describe("Command Search V2 UI contract", () => {
  it("renders dedicated historical Flight and smart-action result groups", () => {
    expect(paletteSource).toContain("results?.flights");
    expect(paletteSource).toContain("results?.actions");
    expect(paletteSource).toContain("t.search.flightResults");
    expect(paletteSource).toContain("t.commandSearch.smartActions");
    expect(paletteSource).toContain('item.kind === "flight"');
    expect(paletteSource).toContain("smartActionLabels(item)");
    expect(paletteSource).toContain('result.kind === "flight"');
  });

  it("persists Flight and smart-action selections as safe browser-local recents", () => {
    expect(parseCommandSearchRecents(JSON.stringify([
      { key: "flight:42", kind: "flight", label: "CSA123", detail: "LKPR → LOWW", href: "/flights/42" },
      { key: "action:airport_operations:LOWW", kind: "action", label: "LOWW Operations", detail: null, href: "/airports/LOWW#airport-intelligence-v3" },
    ]))).toHaveLength(2);
  });

  it("supports exact destination deep-links in the historical flights browser", () => {
    expect(flightsBrowserSource).toContain('params.get("destination")');
    expect(flightsBrowserSource).toContain('params.set("destination", destination)');
    expect(flightsBrowserSource).toContain('className="browse-filter-chip"');
    expect(flightsBrowserSource).toContain("clearDestination");
  });

  it("keeps smart-action destinations anchored to the existing product surfaces", () => {
    expect(recapSource).toContain('id="operational-events"');
    expect(recapSource).toContain('id="interesting-aircraft"');
    expect(airportBoardSource).toContain('id="airport-intelligence-v3"');
  });
});
