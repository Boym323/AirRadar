import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FlightRoute } from "@/lib/aircraft/types";
import type { Airport } from "@/lib/airports/types";
import {
  createRouteAirportGeoJSON,
  createRouteGeoJSON,
  emptyRouteAirportGeoJSON,
  emptyRouteGeoJSON,
  interpolateGreatCircle,
  MAX_ROUTE_POINTS_PER_SEGMENT,
  ROUTE_V2_AIRPORT_SOURCE_ID,
  ROUTE_V2_COMPLETED_LAYER_ID,
  ROUTE_V2_REMAINING_LAYER_ID,
  ROUTE_V2_SOURCE_ID,
} from "@/lib/route-visualization";

const radarSource = readFileSync(new URL("../components/airradar-app.tsx", import.meta.url), "utf8");

const origin: Airport = {
  icaoCode: "lkpr",
  iataCode: "prg",
  name: "Prague",
  city: "Prague",
  country: "CZ",
  latitude: 50.1008,
  longitude: 14.26,
};
const destination: Airport = {
  icaoCode: "EDDF",
  iataCode: "FRA",
  name: "Frankfurt",
  city: "Frankfurt",
  country: "DE",
  latitude: 50.0379,
  longitude: 8.5622,
};

function route(overrides: Partial<FlightRoute> = {}): FlightRoute {
  return {
    callsign: "TEST123",
    airline: "Test Air",
    airlineIcao: "TST",
    airlineIata: "TT",
    origin: "LKPR",
    destination: "EDDF",
    originAirport: origin,
    destinationAirport: destination,
    source: "test",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("route visualization V2", () => {
  it("creates completed and remaining geodesic segments for origin/current/destination", () => {
    const result = createRouteGeoJSON(route(), { lat: 50.5, lon: 12 });

    expect(result.features).toHaveLength(2);
    expect(result.features.map((feature) => feature.properties.segment)).toEqual(["completed", "remaining"]);
    expect(result.features[0].geometry.coordinates[0]).toEqual([origin.longitude, origin.latitude]);
    expect(result.features[0].geometry.coordinates.at(-1)).toEqual([12, 50.5]);
    expect(result.features[1].geometry.coordinates[0]).toEqual([12, 50.5]);
    expect(result.features[1].geometry.coordinates.at(-1)).toEqual([destination.longitude, destination.latitude]);
  });

  it("renders origin-only and destination-only fallbacks", () => {
    const originOnly = createRouteGeoJSON(route({ destination: null, destinationAirport: null }), { lat: 50.5, lon: 12 });
    const destinationOnly = createRouteGeoJSON(route({ origin: null, originAirport: null }), { lat: 50.5, lon: 12 });

    expect(originOnly.features).toHaveLength(1);
    expect(originOnly.features[0].properties.segment).toBe("completed");
    expect(destinationOnly.features).toHaveLength(1);
    expect(destinationOnly.features[0].properties.segment).toBe("remaining");
  });

  it("does not render a missing route, invalid airport coordinates, or invalid current position", () => {
    const invalidOrigin = { ...origin, latitude: Number.NaN };
    const invalidAirportRoute = route({ originAirport: invalidOrigin });

    expect(createRouteGeoJSON(undefined, { lat: 50, lon: 14 })).toEqual(emptyRouteGeoJSON());
    expect(createRouteGeoJSON(invalidAirportRoute, { lat: 50, lon: 14 }).features).toHaveLength(1);
    expect(createRouteGeoJSON(route(), { lat: Number.NaN, lon: 14 })).toEqual(emptyRouteGeoJSON());
    expect(createRouteAirportGeoJSON(invalidAirportRoute).features).toEqual([
      expect.objectContaining({ properties: expect.objectContaining({ role: "destination", icao: "EDDF" }) }),
    ]);
    expect(createRouteAirportGeoJSON(undefined)).toEqual(emptyRouteAirportGeoJSON());
  });

  it("keeps canonical airport ICAO identity and airport labels", () => {
    const result = createRouteAirportGeoJSON(route());

    expect(result.features).toHaveLength(2);
    expect(result.features.map((feature) => feature.properties.icao)).toEqual(["LKPR", "EDDF"]);
    expect(result.features[0].properties.code).toBe("PRG · LKPR");
    expect(result.features[1].properties.code).toBe("FRA · EDDF");
  });

  it("clears on deselect and replaces the previous route when the ICAO selection changes", () => {
    const selectedRoute = createRouteGeoJSON(route(), { lat: 50.5, lon: 12 });
    const switchedRoute = createRouteGeoJSON(route({ originAirport: destination, destinationAirport: origin }), { lat: 49, lon: 10 });

    expect(selectedRoute.features).toHaveLength(2);
    expect(switchedRoute.features[0].geometry.coordinates[0]).toEqual([destination.longitude, destination.latitude]);
    expect(createRouteGeoJSON(undefined, null)).toEqual(emptyRouteGeoJSON());
  });

  it("bounds geodesic interpolation and keeps dateline crossings short", () => {
    const bounded = interpolateGreatCircle({ lat: 0, lon: 0 }, { lat: 80, lon: 170 }, MAX_ROUTE_POINTS_PER_SEGMENT);
    const dateline = interpolateGreatCircle({ lat: 10, lon: 179 }, { lat: 10, lon: -179 });

    expect(bounded.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS_PER_SEGMENT);
    expect(bounded.length).toBeGreaterThan(2);
    expect(dateline.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS_PER_SEGMENT);
    expect(dateline.at(-1)?.[0]).toBe(181);
    expect(Math.max(...dateline.slice(1).map((point, index) => Math.abs(point[0] - dateline[index][0])))).toBeLessThan(10);
  });

  it("uses a Route V2 namespace separate from the live-track source", () => {
    expect(new Set([
      ROUTE_V2_SOURCE_ID,
      ROUTE_V2_COMPLETED_LAYER_ID,
      ROUTE_V2_REMAINING_LAYER_ID,
      ROUTE_V2_AIRPORT_SOURCE_ID,
    ])).not.toContain("selected-trail");
    expect(radarSource).toContain("ROUTE_V2_COMPLETED_LAYER_ID");
    expect(radarSource).toContain("ROUTE_V2_REMAINING_LAYER_ID");
    expect(radarSource).toContain("ROUTE_V2_AIRPORT_SOURCE_ID");
    expect(radarSource).toContain("AirportRouteLink");
  });

  it("does not add a route network loop or FlightPosition query", () => {
    expect(radarSource.match(/new EventSource\(/g)).toHaveLength(2);
    expect(radarSource.match(/\/api\/stream/g)).toHaveLength(1);
    expect(radarSource).not.toContain("FlightPosition");
    expect(radarSource).toContain("createRouteGeoJSON(");
  });
});
