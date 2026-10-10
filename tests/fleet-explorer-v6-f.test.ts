import { describe, expect, it } from "vitest";
import type { FleetAircraft } from "@/lib/server/fleet";
import { buildFleetSummary, filterFleetAircraft } from "@/lib/fleet-explorer-v6-f";
const row = (icaoHex: string, extra: Partial<FleetAircraft> = {}): FleetAircraft => ({
  icaoHex, live: false, registration: null, aircraftType: null, operator: null, manufacturer: null, model: null,
  callsign: null, lastObservedAt: null, observations7d: 0, observations30d: 0, topRoutes: [], topAirports: [],
  watchlistEnabled: true, ...extra,
});
const items = [row("AAAAAA", { live: true, operator: "Lufthansa", registration: "D-AIXA", observations30d: 7, lastObservedAt: "2026-10-10T10:00:00Z" }),
  row("BBBBBB", { operator: "CSA", registration: "OK-AAA", observations30d: 4, lastObservedAt: null })];
describe("Fleet Explorer V6-F", () => {
  it("counts bounded existing data only", () => expect(buildFleetSummary(items)).toEqual({ total: 2, live: 1, offline: 1, observations30d: 11 }));
  it("searches, filters and sorts without mutating the source", () => {
    expect(filterFleetAircraft(items, { query: "d-aixa", filter: "all", sort: "registration" }).map(x => x.icaoHex)).toEqual(["AAAAAA"]);
    expect(filterFleetAircraft(items, { query: "", filter: "offline", sort: "lastObserved" }).map(x => x.icaoHex)).toEqual(["BBBBBB"]);
    expect(filterFleetAircraft(items, { query: "", filter: "all", sort: "observations30d" }).map(x => x.icaoHex)).toEqual(["AAAAAA", "BBBBBB"]);
    expect(items.map(x => x.icaoHex)).toEqual(["AAAAAA", "BBBBBB"]);
  });
  it("handles empty, missing and unknown data", () => {
    expect(filterFleetAircraft([], { query: "", filter: "all", sort: "lastObserved" })).toEqual([]);
    expect(filterFleetAircraft(items, { query: "NONEXISTENT", filter: "all", sort: "lastObserved" })).toEqual([]);
  });
});
