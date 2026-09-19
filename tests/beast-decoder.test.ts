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
});
