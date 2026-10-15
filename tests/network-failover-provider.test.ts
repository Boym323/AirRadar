import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { isFreshPosition, positionObservedAt } from "@/lib/aircraft/source-merge";
import { createNetworkFailoverProvider, mergeNetworkObservations, resolveNetworkLaneActivation } from "@/lib/server/network-failover-provider";
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("independent network integration activation", () => {
  it("does not activate ADSBHub by enabling ADSB.lol, or vice versa", () => {
    const make = (hub: boolean, lol: boolean, raw = false, http = true) =>
      resolveNetworkLaneActivation(true, {
        adsbHubEnabled: hub, adsbLolEnabled: lol,
        adsbLolRawEnabled: raw, adsbLolHttpFallbackEnabled: http,
      });
    expect(make(false, false)).toEqual({ hub: false, raw: false, http: false });
    expect(make(true, false)).toEqual({ hub: true, raw: false, http: false });
    expect(make(false, true)).toEqual({ hub: false, raw: false, http: true });
    expect(make(false, true, true, false)).toEqual({ hub: false, raw: true, http: false });
    expect(make(true, true, true)).toEqual({ hub: true, raw: true, http: true });
    expect(resolveNetworkLaneActivation(false, {
      adsbHubEnabled: true, adsbLolEnabled: true,
      adsbLolRawEnabled: true, adsbLolHttpFallbackEnabled: true,
    })).toEqual({ hub: false, raw: false, http: false });
  });

  it("keeps disabled sources disabled in diagnostics without opening sockets", () => {
    vi.stubEnv("ADSBHUB_ENABLED", "false");
    vi.stubEnv("ADSBLOL_ENABLED", "false");
    vi.stubEnv("ADSBLOL_HTTP_FALLBACK_ENABLED", "true");
    const network = createNetworkFailoverProvider(receiver, true);
    expect(network.getDiagnostics().enabled).toBe(false);
    expect(network.getDiagnostics().adsbhubLane?.enabled).toBe(false);
    expect(network.getNextPollDelayMs()).toBe(Number.POSITIVE_INFINITY);

    vi.stubEnv("ADSBHUB_ENABLED", "true");
    const hubOnly = createNetworkFailoverProvider(receiver, true);
    expect(hubOnly.getDiagnostics().adsbhubLane?.enabled).toBe(true);
    expect(hubOnly.getDiagnostics().enabled).toBe(true);
  });

  it("does not let a disabled 1s hub lane speed up HTTP-only network polling", async () => {
    vi.stubEnv("ADSBHUB_ENABLED", "false");
    vi.stubEnv("ADSBLOL_ENABLED", "true");
    vi.stubEnv("ADSBLOL_RAW_ENABLED", "false");
    vi.stubEnv("ADSBLOL_HTTP_FALLBACK_ENABLED", "true");
    vi.stubEnv("ADSBLOL_POLL_INTERVAL_MS", "10000");
    const calls = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      now: Date.now(), ac: [], total: 0, msg: "No error",
    }), { status: 200 }));
    vi.stubGlobal("fetch", calls);
    const network = createNetworkFailoverProvider(receiver, true);
    try {
      expect(network.getDiagnostics().adsbhubLane?.enabled).toBe(false);
      expect(network.getDiagnostics().enabled).toBe(true);
      expect((await network.getSnapshot()).aircraft).toEqual([]);
      expect(calls).toHaveBeenCalledTimes(1);
      // Until this fix, the unused ADSBHub lane always forced a 1s loop.
      expect(network.getNextPollDelayMs()).toBeGreaterThan(1000);
      await network.getSnapshot();
      expect(calls).toHaveBeenCalledTimes(1);
    } finally {
      await network.stop();
    }
  });
});
