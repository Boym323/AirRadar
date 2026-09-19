import { describe, expect, it } from "vitest";
import type { Aircraft, ReceiverPosition } from "@/lib/aircraft/types";
import { aggregateCoverage } from "@/lib/server/receiver-coverage-analytics";

const receiver: ReceiverPosition = { lat: 50, lon: 14, name: "test" };
function aircraft(hex: string, origin: "local" | "adsbhub", extra: Partial<Aircraft> = {}): Aircraft {
  const at = "2026-09-19T12:00:00.000Z";
  return { icaoHex: hex, callsign: null, registration: null, aircraftType: null, aircraftDescription: null, lat: 50.1, lon: 14.1, altitude: 20_000, baroAltitude: 20_000, geomAltitude: null, groundSpeed: null, track: null, verticalRate: null, baroRate: null, geomRate: null, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: at, source: "ADS-B", origin, provenance: { seenLocal: origin === "local", seenNetwork: origin !== "local", lastLocalSeen: origin === "local" ? at : null, lastNetworkSeen: origin !== "local" ? at : null, positionOrigin: origin, positionSource: "ADS-B" }, sourceType: null, onGround: false, distanceKm: 0, bearing: 45, trail: [], ...extra };
}
describe("receiver coverage eligibility and aggregation", () => {
  it("counts fresh network observations and only fresh local matches", () => {
    const network = [aircraft("abc123", "adsbhub"), aircraft("def456", "adsbhub", { lat: 51.5, lon: 14 })];
    const local = new Map([["ABC123", aircraft("ABC123", "local")], ["DEF456", aircraft("DEF456", "local", { provenance: { ...aircraft("DEF456", "local").provenance!, lastLocalSeen: "2026-09-19T11:00:00.000Z" } })]]);
    const result = aggregateCoverage(network, local, receiver, 175, Date.parse("2026-09-19T12:00:00.000Z"), 60_000, 60_000);
    expect(result.available).toBe(2); expect(result.captured).toBe(1); expect(result.buckets.get("overall")).toEqual({ available: 2, captured: 1 });
  });
  it("uses one bucket at exact range and azimuth boundaries", () => {
    const item = aircraft("abc123", "adsbhub", { bearing: 360, lat: 50, lon: 14 });
    const result = aggregateCoverage([item], new Map(), receiver, 175, Date.parse("2026-09-19T12:00:00.000Z"), 60_000, 60_000);
    expect(result.buckets.get("azimuth:35")).toBeUndefined();
    expect([...result.buckets.keys()].filter((key) => key.startsWith("azimuth:")).length).toBe(1);
    expect([...result.buckets.keys()].filter((key) => key.startsWith("range:")).length).toBe(1);
  });
  it("excludes stale, invalid and out-of-radius network observations", () => {
    const stale = aircraft("abc123", "adsbhub", { provenance: { ...aircraft("abc123", "adsbhub").provenance!, lastNetworkSeen: "2026-09-19T11:00:00.000Z" } });
    const outside = aircraft("def456", "adsbhub", { lat: 53, lon: 14 });
    const invalid = aircraft("~abcde", "adsbhub");
    expect(aggregateCoverage([stale, outside, invalid], new Map(), receiver, 175, Date.parse("2026-09-19T12:00:00.000Z"), 60_000, 60_000).available).toBe(0);
  });
});
