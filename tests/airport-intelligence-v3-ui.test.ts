import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detailSource = readFileSync(new URL("../components/airport-detail.tsx", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../components/airport-operations-controller.ts", import.meta.url), "utf8");
const boardSource = readFileSync(new URL("../components/airport-operations-board.tsx", import.meta.url), "utf8");
const weatherSource = readFileSync(new URL("../components/airport-weather.tsx", import.meta.url), "utf8");
const liveTrafficSource = readFileSync(new URL("../components/airport-live-traffic-controller.ts", import.meta.url), "utf8");
const nearbySource = readFileSync(new URL("../components/airport-nearby-aircraft.tsx", import.meta.url), "utf8");

describe("Airport Intelligence V3 UI boundary", () => {
  it("uses one page-scoped operations/weather controller for the V3 board and weather panel", () => {
    expect(detailSource).toContain("useAirportOperationsController(airport.icaoCode)");
    expect(detailSource).toContain("<AirportOperationsBoard");
    expect(detailSource).toContain("sharedState={{");
    expect(detailSource).not.toContain("<AirportMovements");
    expect(detailSource).not.toContain("<AirportOperationalSummary");
  });

  it("keeps the controller read-only and avoids another live aircraft stream", () => {
    expect(controllerSource).toContain("/operations?period=24h");
    expect(controllerSource).toContain("/api/weather/airport/");
    expect(controllerSource.match(/fetch\(/g)).toHaveLength(2);
    expect(controllerSource).toContain("AIRPORT_LIVE_BOARD_REFRESH_MS = 30_000");
    expect(controllerSource).toContain("window.setTimeout");
    expect(controllerSource).toContain("window.clearTimeout");
    expect(controllerSource).not.toContain("setInterval");
    expect(controllerSource).not.toContain("new EventSource");
    expect(controllerSource).not.toContain("POST");
    expect(controllerSource).not.toContain("PATCH");
    expect(controllerSource).not.toContain("DELETE");
  });

  it("links unified movement events directly to Flight Story and labels inference", () => {
    expect(boardSource).toContain("aircraftFlightHref(movement.flightId)");
    expect(boardSource).toContain('data-testid="airport-intelligence-v3"');
    expect(boardSource).toContain('data-testid="airport-v3-timeline"');
    expect(boardSource).toContain('data-testid="airport-live-board"');
    expect(boardSource).toContain('testId="airport-live-board-arrivals"');
    expect(boardSource).toContain('testId="airport-live-board-departures"');
    expect(boardSource).toContain('testId="airport-live-board-alerts"');
    expect(boardSource).toContain('data-testid="airport-live-board-runways"');
    expect(boardSource).toContain('data-testid="airport-live-board-weather"');
    expect(boardSource).toContain('data-product="airport-live-board-v5"');
    expect(boardSource).toContain('testId="airport-live-board-active-inbound"');
    expect(boardSource).toContain('testId="airport-live-board-active-outbound"');
    expect(boardSource).toContain("buildAirportCorrelatedTrafficSnapshot");
    expect(boardSource).toContain("aircraftFlightHref(observation.movement.flightId)");
    expect(boardSource).toContain("liveBoardLiveOnly");
    expect(boardSource).toContain("journeyLabel(observation.journey.stage)");
    expect(boardSource).toContain("liveBoardJourneyLanded");
    expect(boardSource).toContain("routeRelationLabel(observation.journey.routeRelation)");
    expect(boardSource).toContain("liveBoardRouteConflict");
    expect(boardSource).toContain("buildAirportJourneyFlowSummary");
    expect(boardSource).toContain('data-testid="airport-live-board-flow-pulse"');
    expect(boardSource).toContain('data-testid="airport-live-board-flow-attention"');
    expect(boardSource).toContain('variant="inferred"');
    expect(boardSource).toContain("t.airport.v3RunwayDisclaimer");
  });

  it("shares exactly one airport live aircraft stream across board and nearby traffic", () => {
    expect(detailSource).toContain("useAirportLiveTrafficController(airport)");
    expect(liveTrafficSource.match(/new EventSource\(/g)).toHaveLength(1);
    expect(liveTrafficSource).toContain('new EventSource("/api/stream")');
    expect(nearbySource).not.toContain("new EventSource");
    expect(boardSource).not.toContain("fetch(");
    expect(boardSource).not.toContain("new EventSource");
  });

  it("allows the airport weather panel to consume the shared snapshot without starting its own request", () => {
    expect(weatherSource).toContain("sharedState?: AirportWeatherPanelSharedState");
    expect(weatherSource).toContain("if (!externallyControlled) void loadWeather();");
  });
});
