import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlightRoute, TrailPoint } from "@/lib/aircraft/types";
import { selectedTrail } from "@/lib/aircraft/trail";
import {
  createRouteGeoJSON,
  emptyRouteGeoJSON,
  ROUTE_V2_AIRPORT_SOURCE_ID,
  ROUTE_V2_COMPLETED_LAYER_ID,
  ROUTE_V2_REMAINING_LAYER_ID,
  ROUTE_V2_SOURCE_ID,
} from "@/lib/route-visualization";

const radarSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");
const searchSource = readFileSync(new URL("../components/global-search.tsx", import.meta.url), "utf8");
const serverSearchSource = readFileSync(new URL("../lib/server/search.ts", import.meta.url), "utf8");

const origin = {
  icaoCode: "LKPR",
  iataCode: "PRG",
  name: "Prague",
  city: "Prague",
  country: "CZ",
  latitude: 50.1,
  longitude: 14.3,
};
const destination = {
  icaoCode: "EDDF",
  iataCode: "FRA",
  name: "Frankfurt",
  city: "Frankfurt",
  country: "DE",
  latitude: 50.0,
  longitude: 8.6,
};
const route: FlightRoute = {
  callsign: "TEST123",
  airline: "Test Air",
  airlineIcao: "TST",
  airlineIata: "TT",
  origin: "LKPR",
  destination: "EDDF",
  originAirport: origin,
  destinationAirport: destination,
  source: "test",
  retrievedAt: "2026-09-08T12:00:00.000Z",
};

function point(lon: number, recordedAt: string): TrailPoint {
  return { lat: 50, lon, recordedAt, altitude: 30_000, groundSpeed: 420, track: 90 };
}

describe("feature integration", () => {
  it("keeps the selected live trail and Route V2 context active together", () => {
    const trail = selectedTrail(new Map([["ABC123", [point(14, "2026-09-08T12:00:00.000Z")]]]), "ABC123", [], Date.parse("2026-09-08T12:01:00.000Z"));
    const routeGeoJSON = createRouteGeoJSON(route, { lat: 50.2, lon: 12 });

    expect(trail).toHaveLength(1);
    expect(routeGeoJSON.features.map((feature) => feature.properties.segment)).toEqual(["completed", "remaining"]);
    expect(radarSource).toContain('map.addSource("selected-trail"');
    expect(radarSource).toContain("map.addSource(ROUTE_V2_SOURCE_ID");
    expect(radarSource).toContain('map.getSource("selected-trail")');
    expect(radarSource).toContain("map.getSource(ROUTE_V2_SOURCE_ID)");
  });

  it("cleans both overlays on switch and deselect without crossing identities", () => {
    const trails = new Map([
      ["OLD123", [point(13, "2026-09-08T12:00:00.000Z")]],
      ["NEW456", [point(15, "2026-09-08T12:00:00.000Z")]],
    ]);

    expect(selectedTrail(trails, "NEW456", [], Date.parse("2026-09-08T12:01:00.000Z"))).toEqual(trails.get("NEW456"));
    expect(selectedTrail(trails, null, [])).toEqual([]);
    expect(createRouteGeoJSON(undefined, null)).toEqual(emptyRouteGeoJSON());
    expect(radarSource).toContain("setSelectedHistoryTrail(null);");
    expect(radarSource).toContain("if (!selectedHex) return;");
    expect(radarSource).toContain("selectedTrailForMap");
    expect(radarSource).toContain("createRouteGeoJSON(");
  });

  it("keeps the MapLibre namespaces disjoint", () => {
    const routeIds = [
      ROUTE_V2_SOURCE_ID,
      ROUTE_V2_COMPLETED_LAYER_ID,
      ROUTE_V2_REMAINING_LAYER_ID,
      ROUTE_V2_AIRPORT_SOURCE_ID,
    ];

    expect(new Set(routeIds).size).toBe(routeIds.length);
    expect(new Set([...routeIds, "selected-trail", "selected-trail-line"]).size).toBe(routeIds.length + 2);
    expect(radarSource).not.toContain('map.addSource("selected-route"');
    expect(radarSource).not.toContain('id: "selected-route-line"');
  });

  it("keeps global search in the header without changing map transport", () => {
    expect(radarSource).toContain('import { GlobalSearch } from "@/components/global-search";');
    expect(radarSource).toContain("<GlobalSearch />");
    expect(radarSource.match(/new EventSource\(/g)).toHaveLength(1);
    expect(radarSource.match(/\/api\/stream/g)).toHaveLength(1);
    expect(radarSource).not.toContain("setInterval(");
    expect(searchSource).not.toContain("EventSource");
    expect(searchSource).not.toContain("/api/stream");
    expect(searchSource).toContain("SEARCH_DEBOUNCE_MS = 220");
  });

  it("keeps aircraft and airport result navigation canonical", () => {
    expect(serverSearchSource).toContain("href: `/aircraft/${encodeURIComponent(aircraft.icaoHex)}`");
    expect(serverSearchSource).toContain("href: `/airports/${encodeURIComponent(airport.icaoCode)}`");
    expect(searchSource).toContain("href={item.href as SearchHref}");
  });
});
