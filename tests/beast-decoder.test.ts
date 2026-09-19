import { describe, expect, it } from "vitest";
import { BeastDecoder } from "@/lib/server/beast-decoder";
import type { BeastFrame } from "@/lib/server/beast-parser";

const receiver = { lat: 50, lon: 14, name: "test" };
function frame(hex: string): BeastFrame {
  return { type: 0x33, timestamp: Buffer.alloc(6), signal: 200, payload: Buffer.from(hex, "hex") };
}

describe("BeastDecoder", () => {
  it("decodes ICAO and callsign from a deterministic DF17 identification frame", () => {
    const aircraft = new BeastDecoder(receiver).decode(frame("8d4840d6202cc371c32ce0576098"), Date.parse("2026-01-01T00:00:00Z"));
    expect(aircraft).toMatchObject({ icaoHex: "4840D6", callsign: "KLM1023", source: "ADS-B" });
  });
  it("merges multiple messages into one bounded aircraft state", () => {
    const decoder = new BeastDecoder(receiver, 1, 30_000);
    decoder.decode(frame("8d4840d6202cc371c32ce0576098"));
    decoder.decode(frame("8d4840d6202cc371c32ce0576098"));
    expect(decoder.snapshot()).toHaveLength(1);
    expect(decoder.snapshot()[0].messages).toBe(2);
  });
  it("performs global airborne CPR independently of the receiver position", () => {
    const decoder = new BeastDecoder({ lat: 49.22, lon: 17.67, name: "Zlin" }, 10, 30_000, { origin: "adsblol" });
    decoder.decode(frame("8d40621d58c382d690c8ac2863a7"), 1_000);
    const aircraft = decoder.decode(frame("8d40621d58c386435cc412692ad6"), 2_000);
    expect(aircraft).toMatchObject({ origin: "adsblol", provenance: { seenLocal: false, seenNetwork: true } });
    expect(aircraft?.lat).toBeCloseTo(52.2658, 3);
    expect(aircraft?.lon).toBeCloseTo(3.9389, 3);
    expect(aircraft?.distanceKm).toBeGreaterThan(700);
  });
});
