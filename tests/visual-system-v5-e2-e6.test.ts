import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { visualSystemV5EText } from "@/lib/i18n/visual-system-v5-e";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const radar = read("components/airradar-app.tsx");
const quick = read("components/radar/radar-quick-actions.tsx");
const aircraft = read("components/aircraft-radar-quick-detail.tsx");
const airport = read("components/airport-detail.tsx");
const nearby = read("components/airport-nearby-aircraft.tsx");
const css = read("app/globals.css");
const gate = read("scripts/production-gates.mjs");

describe("Visual System V5-E2–E6", () => {
  it("uses true map focus without a duplicate map instance or traffic request", () => {
    expect(quick).toContain('data-testid="radar-quick-map-focus"');
    expect(quick).toContain('aria-label={mapFocus ? visual.leaveFocusMap : visual.focusMap}');
    expect(quick).toContain('className="radar-v5-map-focus-compact"');
    expect(css).toContain(".radar-quick-actions .radar-v5-map-focus-compact { display: inline; }");
    expect(visualSystemV5EText("cs").leaveFocusMapCompact).toBe("Panely");
    expect(visualSystemV5EText("en").leaveFocusMapCompact).toBe("Panels");
    expect(quick).toContain("aria-pressed={mapFocus}");
    expect(quick).toContain("onClick={onToggleMapFocus}");
    expect(radar).toContain('data-map-focus={mapFocus && drawerState === "closed" ? "true" : "false"}');
    expect(radar).toContain("mapRef.current?.resize()");
    expect(css).toContain('.radar-workspace[data-map-focus="true"] .radar-content');
    expect(css).toContain('.radar-workspace[data-map-focus="true"] .radar-nav-rail { display: none; }');
    expect(gate).toContain("radar-v5-map-focus-desktop");
    expect(gate).toContain("radar-v5-map-focus-mobile");
    expect(gate).toContain("V5-E map focus must give the map its full width");
  });

  it("exposes estimated route progress without replacing observed tracks", () => {
    expect(aircraft).toContain('data-testid="aircraft-v5-route-progress"');
    expect(aircraft).toContain("t.routeCorridor.disclaimer");
    expect(aircraft).toContain("routeCorridor.confidence");
    expect(aircraft).toContain("aria-label={visual.flightProgress}");
    expect(radar).toContain('data-testid="radar-v5-route-evidence"');
    expect(radar).toContain("routeObserved");
    expect(radar).toContain("routeEstimated");
    expect(radar).toContain("routeUncertainty");
    expect(radar).toContain('"selected-trail"');
  });

  it("reuses airport traffic controller and deep links into existing radar selection", () => {
    expect(airport).toContain('data-testid="airport-v5-map-shortcut"');
    expect(airport).toContain('switchView("map")');
    expect(nearby).toContain('data-testid="airport-v5-nearby-filters"');
    expect(nearby).toContain('item.classification === movement');
    expect(nearby).toContain('aria-pressed={movement === option.key}');
    expect(nearby).toContain('/?aircraft=');
    expect(radar).toContain('searchParams.get("aircraft")');
    expect(nearby).not.toContain("new EventSource(");
    expect(gate).toContain("airport-v5-map-mobile");
    expect(gate).toContain("verifyAirportMapShortcut");
  });

  it("keeps full bilingual labels and accessible, token-based controls", () => {
    expect(visualSystemV5EText("cs").focusMap).toBe("Jen mapa");
    expect(visualSystemV5EText("en").focusMap).toBe("Map focus");
    expect(visualSystemV5EText("cs").routeObserved).toBe("Skutečně zachycená stopa");
    expect(visualSystemV5EText("en").airportRadarLink).toBe("On radar");
    expect(css).toContain("var(--surface-interactive)");
    expect(css).toContain(".airport-v5-nearby-filters button:focus-visible");
    expect(css).toContain(".aircraft-v5-route-progress progress");
  });
});
