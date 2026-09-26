import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const quickCss = readFileSync(new URL("../app/radar-aircraft-panel.css", import.meta.url), "utf8");

describe("aircraft radar quick detail", () => {
  it("owns the live drawer structure and keeps the intended section order explicit", () => {
    const renderSource = componentSource.slice(componentSource.indexOf('return <div className="aircraft-quick-detail '));
    const order = [
      "aircraft-quick-header",
      "<RouteSection",
      "<DetailTabs",
      "<AircraftOverview",
      "aircraft-tabpanel-flight",
      "aircraft-tabpanel-aircraft",
      "aircraft-tabpanel-track",
      "<TelemetrySection",
      "<DataSection",
    ].map((marker) => renderSource.indexOf(marker));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(componentSource).not.toContain("FlightAware");
    expect(componentSource).not.toContain("RouteIntelligencePanel");
    expect(componentSource).not.toContain("routeIntelligence");
    expect(componentSource).not.toContain("useEffect");
    expect(componentSource).not.toContain("fetch(");
  });

  it("renders one live metric grid, progressive ATC frequencies, technical disclosure and accessible actions", () => {
    expect(componentSource.match(/className="aircraft-quick-metrics"/g)).toHaveLength(1);
    expect(componentSource).toContain("detailSections");
    expect(componentSource).toContain("aircraftPositionSourceLabel");
    expect(componentSource).toContain("t.atc.moreFrequencies");
    expect(componentSource).toContain("buildAtcHandoffEstimate");
    expect(componentSource).toContain('data-testid="atc-handoff-estimate"');
    expect(componentSource).toContain("t.atc.handoffDisclaimer");
    expect(componentSource).toContain("SigmetSection");
    expect(componentSource).toContain('data-testid="aircraft-sigmet-context"');
    expect(componentSource).toContain("t.weather.sigmetAircraftDisclaimer");
    expect(componentSource).toContain("t.weather.sigmetProjectionDisclaimer");
    expect(componentSource).toContain("t.weather.sigmetProjectedEntry");
    expect(componentSource).toContain('data-testid="sigmet-trajectory-deviation"');
    expect(componentSource).toContain("t.weather.sigmetDeviationDisclaimer");
    expect(componentSource).toContain("t.weather.sigmetCorrelationConfidence");
    expect(componentSource).toContain("WindSection");
    expect(componentSource).toContain('data-testid="aircraft-wind-context"');
    expect(componentSource).toContain("t.weather.windAircraftDisclaimer");
    expect(componentSource).toContain('data-testid="aircraft-wind-ahead"');
    expect(componentSource).toContain("t.weather.windAheadDisclaimer");
    expect(componentSource).toContain("t.weather.windAheadMoreHeadwind");
    expect(appSource).toContain("windAhead={selectedWind.ahead}");
    expect(componentSource).toContain('data-testid="aircraft-destination-wind"');
    expect(componentSource).toContain("t.weather.windDestinationDisclaimer");
    expect(appSource).toContain("destinationWind={selectedWind.destination}");
    expect(appSource).toContain("useSelectedAircraftWindContext(selectedAircraft)");
    expect(componentSource).toContain('data-testid="technical-details"');
    expect(componentSource).toContain("aria-pressed={watchlisted}");
    expect(componentSource).toContain("fullDetailHref");
  });

  it("does not use DOM adjacency to identify quick sections", () => {
    expect(quickCss).not.toContain(".aircraft-altitude-card + .detail-section");
    expect(quickCss).not.toContain(".route-weather-card + .detail-section");
    expect(quickCss).not.toContain(":has(+ .detail-more)");
    expect(quickCss).toContain(".aircraft-quick-atc");
    expect(quickCss).toContain(".aircraft-quick-tracking");
    expect(quickCss).toContain(".aircraft-quick-advanced");
  });

  it("uses the explicit quick API mode and keeps the existing trail/context requests", () => {
    expect(appSource).toContain("?mode=quick&coverage=");
    expect(appSource).toContain("/api/history/${encodeURIComponent(selectedHex)}");
    expect(appSource).toContain("/api/aircraft/${encodeURIComponent(contextAircraftHex)}/context");
  });
});
