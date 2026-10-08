import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(new URL("../components/aircraft-radar-quick-detail.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const quickCss = readFileSync(new URL("../app/radar-aircraft-panel.css", import.meta.url), "utf8");
const telemetrySource = readFileSync(new URL("../components/aircraft-adsb-telemetry.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/aircraft-detail-v3.tsx", import.meta.url), "utf8");

describe("aircraft radar quick detail", () => {
  it("owns the live drawer structure and keeps the intended section order explicit", () => {
    const renderSource = componentSource.slice(componentSource.indexOf('return <div className="aircraft-quick-detail '));
    const order = [
      "aircraft-quick-header",
      "<RouteSection",
      "<DetailTabs",
      "aircraft-tabpanel-flight",
      "<AircraftOverview",
      "aircraft-tabpanel-situation",
      "aircraft-tabpanel-aircraft",
      "aircraft-tabpanel-data",
    ].map((marker) => renderSource.indexOf(marker));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(componentSource).not.toContain("FlightAware");
    expect(componentSource).not.toContain("RouteIntelligencePanel");
    expect(componentSource).not.toContain("routeIntelligence");
    expect(componentSource).toContain("useEffect");
    expect(componentSource).toContain('setActiveTab("situation")');
    expect(componentSource).toContain("[operationalFocusItemId, operationalFocusRevealVersion]");
    expect(componentSource).not.toContain("fetch(");
    expect(componentSource).toContain('useState<DetailTab>("flight")');
    expect((renderSource.match(/<RouteSection/g) ?? []).length).toBe(1);
    expect(renderSource).toContain('className="aircraft-quick-route-state"');
    expect(renderSource).toContain('className="aircraft-quick-header-hero"');
    expect(renderSource).toContain("formatDistance(aircraft.distanceKm)");
    expect(componentSource).toContain('{ id: "situation", label: t.aircraft.detailSections.situation }');
    expect(componentSource).not.toContain('{ id: "overview"');
    expect(componentSource).not.toContain('{ id: "track"');
    expect(componentSource).not.toContain('{ id: "telemetry"');
  });

  it("renders the shared traffic hero with four live metrics, progressive ATC frequencies, technical disclosure and accessible actions", () => {
    expect(componentSource).toContain("<RadarTrafficHero");
    expect(componentSource).toContain("altitude={formatAltitude(aircraft.altitude)}");
    expect(componentSource).toContain("speed={formatSpeed(aircraft.groundSpeed)}");
    expect(componentSource).toContain("track={formatTrack(aircraft.track)}");
    expect(componentSource).toContain("verticalRate={compactVerticalRateLabel(aircraft.verticalRate)}");
    expect(componentSource).not.toContain('className="aircraft-quick-metrics"');
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
    expect(appSource).toContain("useSelectedAircraftWindContext(");
    expect(appSource).toContain("selectedDestination ? { lat: selectedDestination.latitude, lon: selectedDestination.longitude } : null");
    expect(componentSource).toContain("RouteWeatherSection");
    expect(componentSource).toContain('data-testid="route-weather-match"');
    expect(componentSource).toContain("t.weather.routeWeatherDisclaimer");
    expect(componentSource).toContain('data-testid="flight-situation-summary"');
    expect(componentSource).toContain("buildFlightSituationSummary");
    expect(componentSource).toContain("t.intelligence.situationDisclaimer");
    expect(appSource).toContain("/route-weather");
    expect(appSource).toContain("routeWeather={selectedRouteWeather}");
    expect(componentSource).toContain('data-testid="technical-details"');
    expect(componentSource).toContain("aria-pressed={watchlisted}");
    expect(componentSource).toContain("fullDetailHref");
  });

  it("surfaces receiver-local Beast data in aircraft visualizations", () => {
    expect(componentSource).toContain("t.aircraft.beastSignal");
    expect(detailSource).toContain("t.aircraft.beastSignal");
    expect(telemetrySource).toContain("operational?.capabilityClass");
    expect(telemetrySource).toContain("operational?.operationalMode");
    expect(telemetrySource).toContain("operational.nicSupplementA");
    expect(telemetrySource).toContain("operational.silSupplement");
    expect(telemetrySource).toContain("!compact");
  });

  it("compacts stable altitudes, keeps changing climbs visible, and separates history from route enrichment", () => {
    expect(componentSource).toContain("stableAltitudeProfile(chartPoints, livePoint)");
    expect(componentSource).toContain('data-testid="aircraft-quick-stable-altitude"');
    expect(componentSource).toContain("<AircraftAltitudeChart points={chartPoints} livePoint={livePoint} />");
    expect(componentSource).toContain("t.aircraft.showFlightHistory");
    expect(componentSource).toContain("compactVerticalRateLabel(aircraft.verticalRate)");
    expect(componentSource).toContain(" fpm");
    expect(quickCss).toContain(".aircraft-quick-stable-altitude");
    expect(quickCss).toContain("white-space: nowrap;");
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
