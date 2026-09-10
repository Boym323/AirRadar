import { describe, expect, it } from "vitest";
import "temporal-polyfill/full/global";
import { formatFrequencyMhz, formatNavaidFrequency, formatRunwayDimension, sortAirportFrequencies } from "@/lib/airports/infrastructure";
import { makeAirportSyncPlan, writeAirportSyncPlan } from "@/lib/airports/sync";
import type { OurAirportsAirport } from "@/lib/airports/ourairports";

const airport: OurAirportsAirport = { icaoCode: "LKXX", iataCode: null, name: "Test", city: "Test", country: "CZ", latitude: 50, longitude: 14, ourAirportsId: 123, ourAirportsIdent: "CUSTOM1", type: "medium_airport", elevationFt: null, scheduledService: null, region: null, localCode: null };

describe("airport infrastructure v2", () => {
  it("formats dimensions and preserves communication precision", () => {
    expect(formatRunwayDimension(12188, 148)).toBe("3,715 × 45 m");
    expect(formatFrequencyMhz(118.7)).toBe("118.700");
    expect(formatFrequencyMhz(118.705)).toBe("118.705");
    expect(formatNavaidFrequency("VOR-DME", 115300)).toBe("115.300 MHz");
    expect(formatNavaidFrequency("NDB", 365)).toBe("365 kHz");
  });

  it("keeps unknown frequency types after the known UX order", () => {
    const result = sortAirportFrequencies([{ id: 1, type: "ZZZ" }, { id: 2, type: "TWR" }, { id: 3, type: "ATIS" }]);
    expect(result.map((item) => item.type)).toEqual(["ATIS", "TWR", "ZZZ"]);
  });

  it("resolves children by source ident while retaining the local airport FK", async () => {
    const plans: unknown[] = [];
    const bySource = { id: 77, icao: "LKXX", ourAirportsId: 123 };
    const table = (kind: string) => ({ delete: () => ({ build: () => ({ kind: `delete:${kind}` }) }), insert: (rows: unknown[]) => ({ build: () => ({ kind: `insert:${kind}`, rows }) }) });
    const database = { transaction: async (callback: (transaction: unknown) => Promise<void>) => callback({
      orm: { public: { Airport: { where: (filter: { icao?: string; ourAirportsId?: number }) => ({ first: async () => filter.ourAirportsId === 123 || filter.icao === "LKXX" ? bySource : null }) , upsert: async () => undefined } } },
      execute: async (plan: unknown) => { plans.push(plan); },
      sql: { public: { airportRunway: table("runway"), airportFrequency: table("frequency"), navaid: table("navaid") } },
    }) };
    const plan = makeAirportSyncPlan({ airports: [airport], runways: [{ id: 1, airportIdent: "CUSTOM1", lengthFt: null, widthFt: null, surface: "UNKNOWN", lighted: null, closed: false, leIdent: "06", leLatitude: 50, leLongitude: 14, leElevationFt: null, leHeadingDegT: null, leDisplacedThresholdFt: null, heIdent: "24", heLatitude: 50.01, heLongitude: 14.01, heElevationFt: null, heHeadingDegT: null, heDisplacedThresholdFt: null }], frequencies: [], navaids: [], skipped: { airports: 0, runways: 0, frequencies: 0, navaids: 0 }, bytes: { airports: 1, runways: 1, frequencies: 1, navaids: 1 } });
    await writeAirportSyncPlan(database, plan, Temporal.Instant.fromEpochMilliseconds(0));
    const insert = plans.find((item) => (item as { kind?: string }).kind === "insert:runway") as { rows: Array<{ airportId: number }> };
    expect(insert.rows[0].airportId).toBe(77);
  });
});
