import { describe, expect, it } from "vitest";
import type { Aircraft } from "@/lib/aircraft/types";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { summarizeNetworkSourceValue } from "@/lib/server/network-source-value";

const receiver = { lat: 50, lon: 14, name: "Fixture" };
const now = Date.parse("2026-10-15T12:00:00.000Z");
function aircraft(hex: string, observedSecondsAgo = 0): Aircraft {
  const value = normalizeAircraft({
    hex, flight: "TEST123", lat: 50.1, lon: 14.1,
    seen: observedSecondsAgo, seen_pos: observedSecondsAgo, type: "adsb_icao",
  }, receiver, new Date(now));
  if (!value) throw new Error("bad fixture");
  return value;
}

describe("network source utility sampling", () => {
  it("counts distinct per-source positions, shared and exclusive contributions", () => {
    const value = summarizeNetworkSourceValue({
      adsbhub: [aircraft("AA0001"), aircraft("AA0002"), aircraft("AA0002")],
      adsblolRaw: [aircraft("AA0002"), aircraft("AA0003")],
      adsblolHttp: [aircraft("AA0001"), aircraft("AA0003"), aircraft("AA0004")],
    }, now, 30_000);
    expect(value.complete).toBe(true);
    expect(value.unionFreshPositioned).toBe(4);
    expect(value.sources.adsbhub).toEqual({
      reportedAircraft: 3, freshPositioned: 2,
      exclusiveFreshPositioned: 0, overlappingFreshPositioned: 2,
    });
    expect(value.sources.adsblolRaw).toEqual({
      reportedAircraft: 2, freshPositioned: 2,
      exclusiveFreshPositioned: 0, overlappingFreshPositioned: 2,
    });
    expect(value.sources.adsblolHttp).toEqual({
      reportedAircraft: 3, freshPositioned: 3,
      exclusiveFreshPositioned: 1, overlappingFreshPositioned: 2,
    });
    expect(JSON.stringify(value)).not.toContain("AA0001");
  });

  it("distinguishes a failed source from a disabled source or empty response", () => {
    const value = summarizeNetworkSourceValue({
      adsbhub: null, adsblolHttp: [],
    }, now, 30_000);
    expect(value.complete).toBe(false);
    expect(value.sources.adsbhub).toBeNull();
    expect(value.sources.adsblolHttp?.reportedAircraft).toBe(0);
    expect(value.sources.adsblolRaw).toBeUndefined();
    expect(value.unionFreshPositioned).toBe(0);
  });

  it("excludes stale positions and incomplete coordinate pairs", () => {
    const noPosition = { ...aircraft("AA0003"), lon: null };
    const value = summarizeNetworkSourceValue({
      adsbhub: [aircraft("AA0001", 31), noPosition],
      adsblolRaw: [aircraft("AA0002", 5)],
    }, now, 30_000);
    expect(value.unionFreshPositioned).toBe(1);
    expect(value.sources.adsbhub?.freshPositioned).toBe(0);
    expect(value.sources.adsblolRaw?.exclusiveFreshPositioned).toBe(1);
  });

  it("returns only metrics and does not expose individual aircraft positions or identities", () => {
    const value = summarizeNetworkSourceValue({
      adsbhub: [aircraft("AA0001")],
    }, now, 30_000);
    expect(Object.keys(value).sort()).toEqual([
      "ageLimitMs", "complete", "sampledAt", "sources", "unionFreshPositioned",
    ]);
    expect(JSON.stringify(value)).not.toMatch(/AA0001|50\.1|14\.1/);
  });
});
