import { describe, expect, it } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { isFreshPosition, positionObservedAt } from "@/lib/aircraft/source-merge";
import { mergeNetworkObservations } from "@/lib/server/network-failover-provider";
import type { Aircraft, AircraftDataOrigin } from "@/lib/aircraft/types";

const receiver = { lat: 50, lon: 14, name: "Test receiver" };
const now = Date.parse("2026-09-20T12:00:00.000Z");

function make(origin: AircraftDataOrigin, changes: Partial<Aircraft> = {}): Aircraft {
  const base = normalizeAircraft({ hex: "ABC123", flight: "BASE123", lat: 50.1, lon: 14.1, seen: 0, seen_pos: 0, type: "adsb_icao" }, receiver, new Date(now));
  if (!base) throw new Error("test aircraft could not be normalized");
  return {
    ...base,
    origin,
    provenance: { ...base.provenance!, seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: base.lastSeen, positionOrigin: origin, positionSource: base.source },
    ...changes,
  };
}

describe("network observation merge", () => {
  it("uses a fresh loser position atomically when the lastSeen winner has no position", () => {
    const winner = make("adsbhub", { lastSeen: new Date(now - 1_000).toISOString(), lat: null, lon: null, seenPosSeconds: null, trail: [] });
    const loser = make("adsblol", { lastSeen: new Date(now - 2_000).toISOString(), lat: 50.2, lon: 14.2, seenSeconds: 0, seenPosSeconds: 0, trail: [{ lat: 50.2, lon: 14.2, recordedAt: new Date(now - 2_000).toISOString(), altitude: null, groundSpeed: null, track: null }] });
    const merged = mergeNetworkObservations(winner, loser);

    expect(merged).toMatchObject({ lat: 50.2, lon: 14.2, origin: "adsbhub", provenance: { positionOrigin: "adsblol" } });
    expect(isFreshPosition(merged, 30_000, now)).toBe(true);
    expect(positionObservedAt(merged)).toBe(now - 2_000);
    expect(merged.distanceKm).toBe(loser.distanceKm);
    expect(merged.trail).toEqual(loser.trail);
  });

  it("chooses the newer actual position observation instead of the newer message", () => {
    const newerMessageOlderPosition = make("adsbhub", {
      lastSeen: new Date(now - 1_000).toISOString(),
      lat: 50.1,
      lon: 14.1,
      seenSeconds: 0,
      seenPosSeconds: 8,
    });
    const olderMessageNewerPosition = make("adsblol", {
      lastSeen: new Date(now - 2_000).toISOString(),
      lat: 50.3,
      lon: 14.3,
      seenSeconds: 0,
      seenPosSeconds: 0,
    });
    const merged = mergeNetworkObservations(newerMessageOlderPosition, olderMessageNewerPosition);

    expect(merged).toMatchObject({ lat: 50.3, lon: 14.3, provenance: { positionOrigin: "adsblol" } });
    expect(positionObservedAt(merged)).toBe(now - 2_000);
  });

  it("keeps descriptive metadata mergeable without changing position provenance", () => {
    const left = make("adsbhub", { callsign: null, lat: null, lon: null, seenPosSeconds: null, trail: [], lastSeen: new Date(now - 1_000).toISOString() });
    const right = make("adsblol", { callsign: "SECOND123", lat: 50.4, lon: 14.4, lastSeen: new Date(now - 2_000).toISOString(), seenPosSeconds: 0 });
    const merged = mergeNetworkObservations(left, right);

    expect(merged.callsign).toBe("SECOND123");
    expect(merged.provenance?.positionOrigin).toBe("adsblol");
    expect(merged.provenance?.positionSource).toBe(right.source);
  });

  it("never synthesizes a position from one provider's latitude and another's longitude", () => {
    const left = make("adsbhub", { lat: 50.5, lon: null, seenPosSeconds: null });
    const right = make("adsblol", { lat: null, lon: 14.5, seenPosSeconds: null });
    const merged = mergeNetworkObservations(left, right);

    expect(merged.lat).toBeNull();
    expect(merged.lon).toBeNull();
    expect(merged.distanceKm).toBeNull();
    expect(merged.bearing).toBeNull();
    expect(merged.provenance?.positionOrigin).toBeNull();
  });
});
