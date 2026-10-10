import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIRPORT_V5_VIEWS } from "@/lib/airport-v5-views";
import { AirportFlightsTable } from "@/components/airport-v5-flights-table";
import type { AirportMovement } from "@/lib/server/airport-movements";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("Visual System V5-C airport UX", () => {
  const detail = read("components/airport-detail.tsx");
  const board = read("components/airport-operations-board.tsx");
  const gate = read("scripts/production-gates.mjs");
  const css = read("app/globals.css");
  const flightBoard = read("components/airport-v5-flights-table.tsx");
  it("keeps seven accessible views and one shared airport controller", () => {
    expect(AIRPORT_V5_VIEWS).toEqual(["overview", "arrivals", "departures", "operations", "weather", "map", "analytics"]);
    expect(detail).toContain('role="tablist"');
    expect(detail).toContain('role="tabpanel"');
    expect(detail).toContain('aria-selected={view === item}');
    expect(detail).toContain("onTabKeyDown(event, item)");
    expect(detail).toContain("tabsRef = useRef<HTMLElement>(null)");
    expect(detail).toContain("tabs.scrollTo({ left:");
    expect(detail).toContain("data-has-more={tabsHaveMore");
    expect(detail).toContain("useAirportOperationsController(airport.icaoCode, predictiveHexes)");
    expect(detail.match(/useAirportOperationsController\(/g)?.length).toBe(1);
    expect(detail).toContain('<AirportOperationsBoard airport={airport}');
  });
  it("preserves weather, map, infrastructure and analyses without defaulting to all sections", () => {
    expect(detail).toContain('view === "weather" && <section');
    expect(detail).toContain('view === "map" && <div');
    expect(detail).toContain('view === "overview" && <details');
    expect(detail).toContain('view === "analytics" && <div');
    expect(board).toContain('view === "analytics" && <>');
    expect(board).toContain('view === "operations" && <div className="airport-v3-grid">');
    expect(board).toContain('view === "overview" && <>');
    for (const key of ["airport-live-board-v6-pressure", "airport-live-board-v7-runway-flow", "airport-live-board-v7-arrival-sequence", "airport-live-board-v8-arrival-flow", "airport-d2-runway-evidence", "airport-d3-approach-evidence", "airport-d4-operational-context"]) expect(board).toContain(key);
  });
  it("renders observed rather than invented scheduled movement data", () => {
    const item: AirportMovement = {
      flightId: 42, icaoHex: "ABC123", callsign: "CSA123", registration: "OK-ABC",
      movement: "LANDING", confidence: "medium", airport: "LKPR", runway: { designator: "24", status: "probable", confidence: "medium" },
      observedAt: "2026-10-10T11:00:00Z", evidence: ["observed descent"],
    };
    const markup = renderToStaticMarkup(createElement(AirportFlightsTable, { view: "arrivals", movements: [item], loading: false, unavailable: false, incomplete: false, lastUpdated: item.observedAt }));
    expect(markup).toContain("CSA123");
    expect(markup).toContain("RWY 24");
    expect(markup).toContain("airport-v5-flights-table");
    expect(markup).toContain("data-mobile-label=");
    expect(markup).not.toContain("gate=");
    expect(markup).not.toContain("Scheduled ETA");
  });
  it("validates every view in browser smoke and captures mobile and analytics screenshots", () => {
    for (const view of AIRPORT_V5_VIEWS.filter((value) => value !== "overview")) expect(gate).toContain(`switchAirportView("${view}")`);
    expect(gate).toContain('switchAirportView(target.airportCaptureView ?? "overview")');
    const initialCheck = gate.indexOf('const initialRoot = target.airportCaptureView');
    const viewSwitch = gate.indexOf('await switchAirportView(target.airportCaptureView ?? "overview")');
    const postSwitchCheck = gate.indexOf('await targetRoot.waitFor({ state: "visible", timeout: 15_000 });', viewSwitch);
    expect(initialCheck).toBeGreaterThan(-1);
    expect(gate).toContain('visualPage.getByTestId("airport-v5-page")');
    expect(gate).toContain('await initialRoot.waitFor({ state: "visible", timeout: 5_000 });');
    expect(viewSwitch).toBeGreaterThan(initialCheck);
    expect(postSwitchCheck).toBeGreaterThan(viewSwitch);
    expect(gate).toContain("airport-v5-overview-320");
    expect(gate).toContain("airport-v5-arrivals-mobile");
    expect(gate).toContain("airport-v5-analytics-desktop");
  });
  it("keeps D4 prose full-width and renders semantic mobile flight cards without cloning rows", () => {
    expect(board).toContain('className="airport-live-flight-list airport-d4-signals"');
    expect(board).toContain('data-testid="airport-v5-evidence-details"');
    expect(board).toContain('airportDCopy.evidenceUnavailable');
    expect(css).toContain(".airport-v5-evidence-details > summary");
    expect(css).toContain(".airport-d4-signals > li");
    expect(css).toContain('grid-template-areas: "flight movement" "time time" "runway evidence"');
    expect(css).toContain(".airport-v5-flights td::before");
    for (const field of ["timeObserved", "flight", "movement", "runway", "evidence"]) {
      expect(flightBoard).toContain("data-mobile-label={t.airportV5." + field + "}");
    }
    expect(detail).toContain('className="airport-v5-tabs-rail"');
    expect(css).toContain('.airport-v5-tabs-rail[data-has-more="true"]::after');
    expect(css).toContain('.airport-v5-page .ui-page-header-main { display: contents; }');
  });
  it("captures all seven views and regression widths in the release visual gate", () => {
    for (const target of [
      "airport-live-board-desktop", "airport-v5-arrivals-mobile",
      "airport-v5-departures-mobile", "airport-v5-operations-desktop",
      "airport-v5-weather-desktop", "airport-v5-map-desktop",
      "airport-v5-analytics-desktop", "airport-v5-arrivals-320",
      "airport-v5-overview-tablet",
    ]) expect(gate).toContain('name: "' + target + '"');
    expect(gate).toContain('if (!["weather", "map"].includes(target.airportCaptureView))');
    expect(gate).toContain('advanced.getByTestId("airport-v5-evidence-details")');
    expect(gate).toContain('await evidence.locator("summary").click()');
  });

});
