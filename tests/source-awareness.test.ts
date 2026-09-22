import { describe, expect, it } from "vitest";
import type { AircraftView, ReceiverPosition } from "@/lib/aircraft/types";
import { aircraftPositionSourceLabel, classifyAircraftSource, computeLocalCoverageRatio, computeLocalCoverageRatioFromSources, computeSourceStats, filterAircraftBySource } from "@/lib/aircraft/source-awareness";

function aircraft(hex: string, provenance?: AircraftView["provenance"], lat = 50, lon = 14): AircraftView {
  return { icaoHex: hex, callsign: null, registration: null, aircraftType: null, aircraftDescription: null, lat, lon, altitude: 10000, baroAltitude: 10000, geomAltitude: null, groundSpeed: 200, track: 90, verticalRate: 0, baroRate: 0, geomRate: null, squawk: null, category: null, emergency: null, rssi: null, messages: null, seenSeconds: 0, seenPosSeconds: 0, lastSeen: "2026-09-19T12:00:00.000Z", source: "ADS-B", origin: "local", provenance, sourceType: null, onGround: false, distanceKm: null, bearing: null };
}

const local = { seenLocal: true, seenNetwork: false, lastLocalSeen: "2026-09-19T12:00:00.000Z", lastNetworkSeen: null, positionOrigin: "local" as const, positionSource: "ADS-B" as const };
const network = { seenLocal: false, seenNetwork: true, lastLocalSeen: null, lastNetworkSeen: "2026-09-19T12:00:00.000Z", positionOrigin: "adsbhub" as const, positionSource: "UNKNOWN" as const };
const overlap = { ...local, seenNetwork: true, lastNetworkSeen: local.lastLocalSeen, positionOrigin: "local" as const };

describe("source-aware live aircraft", () => {
  it("classifies local-only, network-only, overlap and invalid provenance", () => {
    expect(classifyAircraftSource(aircraft("A", local))).toBe("LOCAL_ONLY");
    expect(classifyAircraftSource(aircraft("B", network))).toBe("NETWORK_ONLY");
    expect(classifyAircraftSource(aircraft("C", overlap))).toBe("OVERLAP");
    expect(classifyAircraftSource(aircraft("D"))).toBe("UNKNOWN");
  });

  it("labels the current position source separately from seen-by coverage", () => {
    expect(aircraft("A", local)).toBeTruthy();
    expect(aircraftPositionSourceLabel(aircraft("A", local))).toBe("LOCAL ADS-B");
    expect(aircraftPositionSourceLabel(aircraft("B", { ...network, positionSource: "MLAT" }))).toBe("ADSBHUB");
    expect(aircraftPositionSourceLabel(aircraft("C", { ...network, positionOrigin: "adsblol" }))).toBe("ADSB.LOL");
  });

  it("computes source counter mathematics from one snapshot", () => {
    const result = computeSourceStats([...Array.from({ length: 10 }, (_, i) => aircraft(`L${i}`, local)), ...Array.from({ length: 20 }, (_, i) => aircraft(`N${i}`, network)), ...Array.from({ length: 5 }, (_, i) => aircraft(`O${i}`, overlap))]);
    expect(result).toMatchObject({ local: 15, network: 25, overlap: 5, localOnly: 10, networkOnly: 20, total: 35 });
    expect(result.total).toBe(result.localOnly + result.networkOnly + result.overlap);
  });

  it("filters local and network as overlapping sets", () => {
    const data = [aircraft("A", local), aircraft("B", network), aircraft("C", overlap)];
    expect(filterAircraftBySource(data, "all").map((item) => item.icaoHex)).toEqual(["A", "B", "C"]);
    expect(filterAircraftBySource(data, "local").map((item) => item.icaoHex)).toEqual(["A", "C"]);
    expect(filterAircraftBySource(data, "network").map((item) => item.icaoHex)).toEqual(["B", "C"]);
    expect(filterAircraftBySource(data, "overlap").map((item) => item.icaoHex)).toEqual(["C"]);
  });

  it("computes source-based coverage from raw network coordinates instead of merged local coordinates", () => {
    const receiver: ReceiverPosition = { lat: 50, lon: 14, name: "test" };
    const now = Date.parse("2026-09-19T12:00:30.000Z");
    const rawNetwork = aircraft("ABC123", network, 50.1, 14.1);
    const rawLocal = aircraft("ABC123", local, 55, 14);

    const result = computeLocalCoverageRatioFromSources(
      new Map([[rawNetwork.icaoHex, rawNetwork]]),
      new Map([[rawLocal.icaoHex, rawLocal]]),
      receiver,
      175,
      now,
    );

    expect(result).toEqual({ radiusNm: 175, numerator: 1, denominator: 1, percentage: 100 });
  });

  it("computes a bounded live local capture ratio and avoids divide by zero", () => {
    const receiver: ReceiverPosition = { lat: 50, lon: 14, name: "test" };
    const now = Date.parse("2026-09-19T12:00:30.000Z");
    const insideLocal = aircraft("L", overlap, 50.1, 14.1);
    const insideNetwork = aircraft("N", network, 50.1, 14.1);
    const outside = aircraft("O", network, 55, 14);
    const stale = aircraft("S", network, 50.1, 14.1);
    stale.provenance = { ...network, lastNetworkSeen: "2026-09-19T11:50:00.000Z" };
    const result = computeLocalCoverageRatio([insideLocal, insideNetwork, outside, stale], receiver, 175, now);
    expect(result).toMatchObject({ numerator: 1, denominator: 2, percentage: 50 });
    expect(computeLocalCoverageRatio([], receiver, 175, now).percentage).toBeNull();
  });
});
