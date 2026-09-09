import { describe, expect, it } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { coverageStats, mergeAircraftMaps, mergeAircraftObservations, positionAgeMs } from "@/lib/aircraft/source-merge";
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

  it("preserves emergency from a fresh network observation and keeps non-ICAO identity separate", () => {
    const local = make("~ABC123", "local");
    const network = make("ABC123", "adsblol", { emergency: "7700" });
    const value = mergeAircraftMaps(new Map([[local.icaoHex, local]]), new Map([[network.icaoHex, network]]), receiver, options);

    expect(value).toHaveLength(2);
    expect(value.find((item) => item.icaoHex === "ABC123")?.emergency).toBe("7700");
    expect(value.find((item) => item.icaoHex === "~ABC123")?.origin).toBe("local");
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
