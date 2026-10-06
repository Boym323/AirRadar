import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const airportsSource = readFileSync(new URL("../components/airports-flights-browser.tsx", import.meta.url), "utf8");
const networkSource = readFileSync(new URL("../components/live-airport-network.tsx", import.meta.url), "utf8");
const favoritesSource = readFileSync(new URL("../components/pwa-register.tsx", import.meta.url), "utf8");

describe("Live Airport Network V1 boundary", () => {
  it("surfaces the network above the existing airport catalog", () => {
    expect(airportsSource).toContain('import { LiveAirportNetwork } from "@/components/live-airport-network"');
    expect(airportsSource).toContain("<LiveAirportNetwork airports={airports} loading={loading} />");
    expect(networkSource).toContain('data-testid="live-airport-network-v1"');
  });

  it("keeps network fan-out bounded and reuses canonical sources", () => {
    expect(networkSource).toContain("const NETWORK_LIMIT = 6");
    expect(networkSource).toContain('new EventSource("/api/stream?coverage=local")');
    expect(networkSource).toContain('"/api/airports/" + encodeURIComponent(icao) + "/operations?period=24h"');
    expect(networkSource).toContain("AIRPORT_LIVE_BOARD_REFRESH_MS");
    expect(networkSource).not.toContain("/api/operations/predictive");
    expect(networkSource).not.toContain("getPrisma");
    expect(networkSource).not.toContain("getAircraftStateService");
  });

  it("reuses canonical airport intelligence for the receiver-only queue", () => {
    expect(networkSource).toContain("buildAirportCorrelatedTrafficSnapshot");
    expect(networkSource).toContain("buildAirportJourneyFlowSummary");
    expect(networkSource).toContain("buildAirportFlowPressureSummary");
    expect(networkSource).toContain("buildAirportRunwayFlowIntelligence");
    expect(networkSource).toContain("buildAirportArrivalSequence");
    expect(networkSource).toContain("buildAirportArrivalFlowIntelligence");
    expect(networkSource).toContain("predictive: null");
  });

  it("shares one browser-local favorite-airport contract with airport detail", () => {
    expect(favoritesSource).toContain('const FAVORITES_KEY = "airradar.favorite-airports.v1"');
    expect(favoritesSource).toContain("export function useFavoriteAirports()");
    expect(favoritesSource).toContain("export function useFavoriteAirport(icao: string)");
    expect(networkSource).toContain("useFavoriteAirports");
  });
});
