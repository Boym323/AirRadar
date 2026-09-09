import { afterEach, describe, expect, it, vi } from "vitest";
import type { Airport } from "@/lib/airports/types";
import { getPrisma } from "@/lib/server/db";
import { getNearbyAirports, NEARBY_AIRPORT_LIMIT } from "@/lib/server/nearby-airports";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn() }));

const target: Airport = { icaoCode: "LKPR", iataCode: "PRG", name: "Prague", city: "Prague", country: "CZ", latitude: 50.1008, longitude: 14.26 };
const rows = [
  { icao: "LKTB", iata: "BRQ", name: "Brno", city: "Brno", country: "CZ", latitude: 49.1513, longitude: 16.6944 },
  { icao: "LOWW", iata: "VIE", name: "Vienna", city: "Vienna", country: "AT", latitude: 48.1103, longitude: 16.5697 },
  { icao: "LKPR", iata: "PRG", name: "Prague", city: "Prague", country: "CZ", latitude: 50.1008, longitude: 14.26 },
  { icao: "XXXX", iata: null, name: "Far away", city: null, country: null, latitude: 40, longitude: -100 },
];

function fakeDatabase() {
  const query = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue(rows) }),
  };
  return { orm: { public: { Airport: query } } };
}

afterEach(() => vi.mocked(getPrisma).mockReset());

describe("nearby airports", () => {
  it("uses bounded local database candidates, excludes self, and sorts by distance", async () => {
    vi.mocked(getPrisma).mockReturnValue(fakeDatabase() as never);
    const result = await getNearbyAirports(target, 10);
    expect(result.map((item) => item.airport.icaoCode)).toEqual(["LKTB", "LOWW"]);
    expect(result[0]?.distanceKm).toBeGreaterThan(0);
    expect(result[0]?.bearing).toBeGreaterThanOrEqual(0);
    expect(result[0]?.bearing).toBeLessThan(360);
  });

  it("caps the result and falls back without a database", async () => {
    vi.mocked(getPrisma).mockReturnValue(null);
    const result = await getNearbyAirports(target, 999);
    expect(result.length).toBeLessThanOrEqual(NEARBY_AIRPORT_LIMIT);
    expect(result.every((item) => item.airport.icaoCode !== "LKPR")).toBe(true);
  });
});
