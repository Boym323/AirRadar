import { describe, expect, it } from "vitest";
import {
  aggregateStatisticsTrafficRows,
  statisticsTrafficBounds,
} from "@/lib/server/statistics-traffic";
import {
  parseStatisticsTrafficRange,
  statisticsTrafficCsv,
} from "@/lib/statistics-traffic";

describe("statistics traffic bounds", () => {
  it("uses local calendar days in Europe/Prague", () => {
    const now = new Date("2026-09-10T20:00:00.000Z");
    const bounds = statisticsTrafficBounds("7d", now, "Europe/Prague");
    expect(bounds.fromKey).toBe("2026-09-04");
    expect(bounds.toKey).toBe("2026-09-10");
    expect(bounds.from.toString()).toBe("2026-09-03T22:00:00Z");
    expect(bounds.to.toString()).toBe("2026-09-10T20:00:00Z");
  });
});

describe("statistics traffic aggregation", () => {
  it("counts Flight instances consistently across rankings", () => {
    const response = aggregateStatisticsTrafficRows({
      range: "30d",
      now: new Date("2026-09-10T20:00:00.000Z"),
      timezone: "Europe/Prague",
      rows: {
        aircraft: [
          { aircraftId: 1, count: 3 },
          { aircraftId: 2, count: 2 },
          { aircraftId: 3, count: 1 },
        ],
        aircraftTypes: [
          { name: "A320", count: 3 },
          { name: "B738", count: 2 },
          { name: null, count: 1 },
        ],
        airlines: [
          { name: "Smartwings", count: 2 },
          { name: "Ryanair", count: 3 },
          { name: " ", count: 1 },
        ],
        routes: [
          { origin: "lkpr", destination: "egll", count: 2 },
          { origin: "LKPR", destination: "EDDF", count: 1 },
          { origin: null, destination: "LKPR", count: 2 },
          { origin: "LKTB", destination: null, count: 1 },
        ],
        countries: [
          { id: 1, registrationCountryCode: "CZ", registrationCountry: "Czechia", operator: "CSA" },
          { id: 2, registrationCountryCode: "DE", registrationCountry: "Germany", operator: "Lufthansa" },
          { id: 3, registrationCountryCode: null, registrationCountry: null, operator: "CSA" },
        ],
      },
    });

    expect(response.observedFlights).toBe(6);
    expect(response.topAircraftTypes).toEqual([
      { name: "A320", count: 3 },
      { name: "B738", count: 2 },
    ]);
    expect(response.topAirlines).toEqual([
      { name: "Ryanair", count: 3 },
      { name: "Smartwings", count: 2 },
    ]);
    expect(response.topOperators).toEqual([
      { name: "CSA", count: 4 },
      { name: "Lufthansa", count: 2 },
    ]);
    expect(response.topRoutes).toEqual([
      { origin: "LKPR", destination: "EGLL", count: 2 },
      { origin: "LKPR", destination: "EDDF", count: 1 },
    ]);
    expect(response.topOrigins).toEqual([
      { name: "LKPR", count: 3 },
      { name: "LKTB", count: 1 },
    ]);
    expect(response.topDestinations).toEqual([
      { name: "EGLL", count: 2 },
      { name: "LKPR", count: 2 },
      { name: "EDDF", count: 1 },
    ]);
    expect(response.registrationCountries).toEqual([
      { name: "CZ · Czechia", count: 3 },
      { name: "DE · Germany", count: 2 },
    ]);
  });

  it("limits public rankings to eight rows", () => {
    const response = aggregateStatisticsTrafficRows({
      range: "today",
      now: new Date("2026-09-10T10:00:00.000Z"),
      timezone: "Europe/Prague",
      rows: {
        aircraft: [{ aircraftId: 1, count: 1 }],
        aircraftTypes: Array.from({ length: 12 }, (_, index) => ({ name: `T${index}`, count: 12 - index })),
        airlines: [],
        routes: [],
        countries: [],
      },
    });
    expect(response.topAircraftTypes).toHaveLength(8);
    expect(response.topAircraftTypes[0]).toEqual({ name: "T0", count: 12 });
  });
});

describe("statistics traffic public helpers", () => {
  it("accepts only supported ranges", () => {
    expect(parseStatisticsTrafficRange(null)).toBe("today");
    expect(parseStatisticsTrafficRange("today")).toBe("today");
    expect(parseStatisticsTrafficRange("7d")).toBe("7d");
    expect(parseStatisticsTrafficRange("30d")).toBe("30d");
    expect(parseStatisticsTrafficRange("365d")).toBeNull();
  });

  it("exports the bounded traffic response as CSV", () => {
    const data = aggregateStatisticsTrafficRows({
      range: "today",
      now: new Date("2026-09-10T10:00:00.000Z"),
      timezone: "Europe/Prague",
      rows: {
        aircraft: [{ aircraftId: 1, count: 2 }],
        aircraftTypes: [{ name: "A320", count: 2 }],
        airlines: [],
        routes: [{ origin: "LKPR", destination: "EGLL", count: 2 }],
        countries: [{ id: 1, registrationCountryCode: "CZ", registrationCountry: "Czechia", operator: "CSA" }],
      },
    });
    const csv = statisticsTrafficCsv(data);
    expect(csv).toContain("summary,today,observed_flights,2");
    expect(csv).toContain("aircraft_type,today,A320,2");
    expect(csv).toContain("operator,today,CSA,2");
    expect(csv).toContain("route,today,LKPR → EGLL,2");
  });
});
