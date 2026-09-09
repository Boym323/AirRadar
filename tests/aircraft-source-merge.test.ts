import { describe, expect, it } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { coverageStats, hasUsablePosition, isFreshPosition, mergeAircraftMaps, mergeAircraftObservations, positionAgeMs } from "@/lib/aircraft/source-merge";
import type { Aircraft } from "@/lib/aircraft/types";

const receiver = { lat: 50, lon: 14, name: "Test receiver" };
const observedAt = new Date("2026-09-09T16:00:00.000Z");

function make(hex: string, origin: "local" | "adsblol", overrides: Record<string, unknown> = {}): Aircraft {
  const value = normalizeAircraft({
    hex,
    flight: origin === "local" ? "LOCAL123" : "NETWORK123",
    r: origin === "adsblol" ? "OK-NET" : undefined,
    lat: 50.1,
    lon: 14.1,
    alt_baro: 20_000,
    gs: 250,
    track: 90,
    seen: 0,
    seen_pos: 0,
    type: origin === "adsblol" ? "mlat" : "adsb_icao",
    rssi: -10,
    messages: 100,
    ...overrides,
  }, receiver, observedAt);
  if (!value) throw new Error("invalid test aircraft");
  return origin === "local" ? value : { ...value, origin: "adsblol", provenance: { ...value.provenance!, seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: value.lastSeen, positionOrigin: "adsblol" } };
}

const options = { localStaleAfterMs: 15_000, networkStaleAfterMs: 30_000, now: observedAt.getTime() };

describe("aircraft source merge", () => {
  it("keeps local-only and network-only aircraft distinct", () => {
    const local = make("ABC123", "local");
    const network = make("DEF456", "adsblol");
    const merged = mergeAircraftMaps(new Map([[local.icaoHex, local]]), new Map([[network.icaoHex, network]]), receiver, options);

    expect(merged.map((item) => item.icaoHex)).toEqual(["ABC123", "DEF456"]);
    expect(merged.find((item) => item.icaoHex === "DEF456")).toMatchObject({ origin: "adsblol", rssi: null, messages: null });
  });

  it("deduplicates by normalized ICAO and prefers a fresh local position", () => {
    const local = make("ABC123", "local", { flight: "LOCAL123", lon: 14.11, seen: 2, seen_pos: 2 });
    const network = make("abc123", "adsblol", { flight: "NETWORK123", lon: 14.12, seen: 4, seen_pos: 4 });
    const value = mergeAircraftObservations(local, network, receiver, options);

    expect(value).not.toBeNull();
    expect(value).toMatchObject({ icaoHex: "ABC123", lon: 14.11, origin: "local", callsign: "LOCAL123" });
    expect(value?.provenance).toMatchObject({ seenLocal: true, seenNetwork: true, positionOrigin: "local" });
  });

  it("keeps a fresh usable local position when network is even fresher", () => {
    const local = make("ABC123", "local", { lat: 50.101, lon: 14.101, seen: 5, seen_pos: 5 });
    const network = make("ABC123", "adsblol", { lat: 50.102, lon: 14.102, seen: 1, seen_pos: 1 });
    const value = mergeAircraftObservations(local, network, receiver, options);

    expect(value).toMatchObject({ lat: 50.101, lon: 14.101, origin: "local" });
    expect(value?.provenance).toMatchObject({ positionOrigin: "local", positionSource: "ADS-B" });
    expect(isFreshPosition(local, options.localStaleAfterMs, options.now)).toBe(true);
  });

  it("uses fresh network kinematics when the local position is stale and then returns to local", () => {
    const staleLocal = make("ABC123", "local", { lon: 14.11, seen: 18, seen_pos: 18 });
    const freshNetwork = make("ABC123", "adsblol", { lon: 14.12, seen: 2, seen_pos: 2 });
    const networkValue = mergeAircraftObservations(staleLocal, freshNetwork, receiver, options);
    expect(networkValue).toMatchObject({ lon: 14.12, origin: "adsblol", source: "MLAT" });

    const freshLocal = make("ABC123", "local", { lon: 14.13, seen: 1, seen_pos: 1 });
    const localValue = mergeAircraftObservations(freshLocal, freshNetwork, receiver, options);
    expect(localValue).toMatchObject({ lon: 14.13, origin: "local" });
    expect(positionAgeMs(staleLocal, observedAt.getTime())).toBe(18_000);
  });

  it("uses local descriptive values and fills missing registration from network", () => {
    const local = make("ABC123", "local", { r: null, flight: "LOCAL123", aircraftType: undefined });
    const network = make("ABC123", "adsblol", { flight: "NETWORK123", r: "OK-NET", t: "A320" });
    const value = mergeAircraftObservations(local, network, receiver, options);

    expect(value).toMatchObject({ callsign: "LOCAL123", registration: "OK-NET" });
  });

  it("uses a fresh network position when local is freshly heard without coordinates", () => {
    const local = make("ABC123", "local", { lat: null, lon: null, seen: 0.1, seen_pos: null });
    const network = make("ABC123", "adsblol", { lat: 50.12, lon: 14.12, seen: 2, seen_pos: 2 });
    const value = mergeAircraftObservations(local, network, receiver, options);

    expect(hasUsablePosition(local)).toBe(false);
    expect(value).toMatchObject({ callsign: "LOCAL123", lat: 50.12, lon: 14.12, origin: "adsblol" });
    expect(value?.provenance).toMatchObject({ seenLocal: true, seenNetwork: true, positionOrigin: "adsblol" });
  });

  it("keeps a live network-only aircraft but clears its stale position", () => {
    const staleNetwork = make("ABC123", "adsblol", { seen: 1, seen_pos: 90, lat: 50.12, lon: 14.12 });
    const value = mergeAircraftObservations(undefined, staleNetwork, receiver, options);

    expect(value).toMatchObject({
      icaoHex: "ABC123",
      lat: null,
      lon: null,
      origin: "adsblol",
      seenSeconds: 1,
      seenPosSeconds: 90,
    });
    expect(value?.provenance).toMatchObject({
      seenLocal: false,
      seenNetwork: true,
      positionOrigin: null,
      positionSource: "UNKNOWN",
    });
  });

  it("uses a fresh network-only position and reports network provenance", () => {
    const freshNetwork = make("ABC123", "adsblol", { seen: 1, seen_pos: 2, lat: 50.12, lon: 14.12 });
    const value = mergeAircraftObservations(undefined, freshNetwork, receiver, options);

    expect(value).toMatchObject({ lat: 50.12, lon: 14.12, origin: "adsblol" });
    expect(value?.provenance).toMatchObject({ positionOrigin: "adsblol", positionSource: "MLAT" });
  });

  it("keeps local last-known position semantics when both positions are stale", () => {
    const staleLocal = make("ABC123", "local", { seen: 1, seen_pos: 20, lat: 50.11, lon: 14.11 });
    const staleNetwork = make("ABC123", "adsblol", { seen: 1, seen_pos: 90, lat: 50.12, lon: 14.12 });
    const value = mergeAircraftObservations(staleLocal, staleNetwork, receiver, options);

    expect(value).toMatchObject({ lat: 50.11, lon: 14.11, origin: "local" });
    expect(value?.provenance).toMatchObject({ positionOrigin: "local", positionSource: "ADS-B" });
  });

  it("does not use stale network coordinates when local position is missing", () => {
    const local = make("ABC123", "local", { lat: null, lon: null, seen: 1, seen_pos: null });
    const staleNetwork = make("ABC123", "adsblol", { seen: 1, seen_pos: 90, lat: 50.12, lon: 14.12 });
    const value = mergeAircraftObservations(local, staleNetwork, receiver, options);

    expect(value).toMatchObject({ lat: null, lon: null, origin: "local" });
    expect(value?.provenance).toMatchObject({ positionOrigin: null, positionSource: "UNKNOWN" });
  });

  it("keeps local-only aircraft when their position is stale or unavailable", () => {
    const localAircraft = [
      make("AAA001", "local", { seen: 0.5, seen_pos: 0.5 }),
      make("BBB002", "local", { seen: 0.5, seen_pos: 20 }),
      make("CCC003", "local", { lat: null, lon: null, seen: 0.2, seen_pos: null }),
      make("DDD004", "local", { seen: 0.5, seen_pos: 0.5 }),
    ];
    const local = new Map(localAircraft.map((aircraft) => [aircraft.icaoHex, aircraft]));
    const merged = mergeAircraftMaps(local, new Map(), receiver, options);

    expect(new Set(merged.map((aircraft) => aircraft.icaoHex))).toEqual(new Set(local.keys()));
    expect(merged).toHaveLength(local.size);
    expect(merged.find((aircraft) => aircraft.icaoHex === "BBB002")).toMatchObject({
      lat: 50.1,
      lon: 14.1,
      origin: "local",
      provenance: { seenLocal: true, seenNetwork: false, positionOrigin: "local" },
    });
    expect(merged.find((aircraft) => aircraft.icaoHex === "CCC003")).toMatchObject({
      lat: null,
      lon: null,
      origin: "local",
      provenance: { seenLocal: true, seenNetwork: false, positionOrigin: null },
    });
  });

  it("merges the complete local/network identity union in linear time", () => {
    const localAircraft = ["AAA001", "BBB002", "CCC003", "DDD004"].map((hex) => make(hex, "local"));
    const networkAircraft = ["CCC003", "DDD004", "EEE005", "FFF006"].map((hex) => make(hex, "adsblol"));
    const local = new Map(localAircraft.map((aircraft) => [aircraft.icaoHex, aircraft]));
    const network = new Map(networkAircraft.map((aircraft) => [aircraft.icaoHex, aircraft]));
    const merged = mergeAircraftMaps(local, network, receiver, options);
    const mergedIds = new Set(merged.map((aircraft) => aircraft.icaoHex));

    expect(mergedIds).toEqual(new Set(["AAA001", "BBB002", "CCC003", "DDD004", "EEE005", "FFF006"]));
    expect(merged).toHaveLength(6);
    for (const id of local.keys()) expect(mergedIds.has(id)).toBe(true);
    expect(merged.length).toBeGreaterThanOrEqual(local.size);
    expect(coverageStats(local, network, merged.length)).toEqual({
      displayedAircraft: 6,
      localAircraft: 4,
      networkAircraft: 4,
      networkOnlyAircraft: 2,
      seenByBoth: 2,
    });
  });

  it("preserves emergency from a fresh network observation and keeps non-ICAO identity separate", () => {
    const local = make("~ABC123", "local");
    const network = make("ABC123", "adsblol", { emergency: "7700" });
    const value = mergeAircraftMaps(new Map([[local.icaoHex, local]]), new Map([[network.icaoHex, network]]), receiver, options);

    expect(value).toHaveLength(2);
    expect(value.find((item) => item.icaoHex === "ABC123")?.emergency).toBe("7700");
    expect(value.find((item) => item.icaoHex === "~ABC123")?.origin).toBe("local");
  });

  it("keeps a fresh network emergency when the newer local message has no emergency", () => {
    const local = make("ABC123", "local", { seen: 0.2, seen_pos: 0.2, emergency: null, squawk: null });
    const network = make("ABC123", "adsblol", { seen: 0.5, seen_pos: 0.5, emergency: "general", squawk: "7700" });
    const value = mergeAircraftObservations(local, network, receiver, options);

    expect(value).toMatchObject({ emergency: "general", squawk: "7700" });
  });

  it("drops an emergency carried only by a stale network observation", () => {
    const local = make("ABC123", "local", { seen: 1, seen_pos: 1, emergency: null });
    const network = make("ABC123", "adsblol", { seen: 31, seen_pos: 31, emergency: "general" });
    const value = mergeAircraftObservations(local, network, receiver, options);

    expect(value).toMatchObject({ origin: "local", emergency: null });
  });

  it("chooses emergency deterministically by freshness, then local provenance", () => {
    const local = make("ABC123", "local", { seen: 3, seen_pos: 3, emergency: "general" });
    const network = make("ABC123", "adsblol", { seen: 0.1, seen_pos: 0.1, emergency: "medical" });
    expect(mergeAircraftObservations(local, network, receiver, options)?.emergency).toBe("medical");

    const equallyFreshLocal = make("ABC123", "local", { seen: 0.5, seen_pos: 0.5, emergency: "general" });
    const equallyFreshNetwork = make("ABC123", "adsblol", { seen: 0.5, seen_pos: 0.5, emergency: "medical" });
    expect(mergeAircraftObservations(equallyFreshLocal, equallyFreshNetwork, receiver, options)?.emergency).toBe("general");
  });

  it("keeps squawk arbitration fresh and consistent with an emergency code", () => {
    const local = make("ABC123", "local", { seen: 5, seen_pos: 5, squawk: "7600" });
    const network = make("ABC123", "adsblol", { seen: 1, seen_pos: 1, squawk: "7700", emergency: "general" });
    expect(mergeAircraftObservations(local, network, receiver, options)?.squawk).toBe("7700");

    const normalNetwork = make("ABC123", "adsblol", { seen: 5, seen_pos: 5, squawk: "1234", emergency: null });
    expect(mergeAircraftObservations(local, normalNetwork, receiver, options)?.squawk).toBe("7600");
  });

  it("reports network MLAT as the position provenance when local position is stale", () => {
    const local = make("ABC123", "local", { seen: 1, seen_pos: 20, type: "adsb_icao" });
    const network = make("ABC123", "adsblol", { seen: 2, seen_pos: 2, type: "mlat" });
    const value = mergeAircraftObservations(local, network, receiver, options);

    expect(value?.provenance).toMatchObject({
      seenLocal: true,
      seenNetwork: true,
      positionOrigin: "adsblol",
      positionSource: "MLAT",
    });
  });

  it("reports coverage counts without counting an aircraft seen by both twice", () => {
    const local = make("ABC123", "local");
    const localOnly = make("DEF456", "local");
    const network = make("ABC123", "adsblol");
    const networkOnly = make("FEDCBA", "adsblol");
    const value = coverageStats(new Map([[local.icaoHex, local], [localOnly.icaoHex, localOnly]]), new Map([[network.icaoHex, network], [networkOnly.icaoHex, networkOnly]]), 3);

    expect(value).toEqual({ displayedAircraft: 3, localAircraft: 2, networkAircraft: 2, networkOnlyAircraft: 1, seenByBoth: 1 });
  });
});
