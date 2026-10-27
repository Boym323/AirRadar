import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BeastParser, type BeastFrame } from "@/lib/server/beast-parser";
import { BeastDecoder } from "@/lib/server/beast-decoder";

// Preserved verbatim from AirRadarV2/contracts/fixtures/beast/cases.json.
// This fixture remains available after V2 is archived or deleted.
interface GoldenFrame {
  name: string;
  type: string;
  hex: string;
  modeS: string;
  receiverTicks: number;
  rssi: number;
}
interface GoldenCases {
  valid: GoldenFrame[];
  invalid: Array<{ name: string; hex: string; expected: string }>;
  knownCrc: { data: string; parity: string };
  cprPair: {
    even: string;
    odd: string;
    decodeReference: { lat: number; lon: number; toleranceDegrees: number };
  };
}
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/airradar-v2-beast-golden.json", import.meta.url), "utf8"),
) as GoldenCases;
const receiver = { lat: 50, lon: 14, name: "V2 contract parity" };

function parse(rawHex: string): BeastFrame {
  const parser = new BeastParser(64 * 1024, { native: false });
  const frames = parser.push(Buffer.from(rawHex, "hex"));
  expect(frames).toHaveLength(1);
  return frames[0]!;
}

describe("AirRadarV2 retained BEAST golden-contract parity", () => {
  it.each(fixtures.valid)("decodes V2 envelope $name exactly", (testcase) => {
    const frame = parse(testcase.hex);
    expect(frame.type).toBe(Number.parseInt(testcase.type, 16));
    expect(frame.payload.toString("hex")).toBe(testcase.modeS);
    expect(frame.signal).toBe(testcase.rssi);
    expect(frame.timestamp.readUIntBE(0, 6)).toBe(testcase.receiverTicks);
  });

  it("handles V2 escaped frames through single-byte transport fragmentation", () => {
    const parser = new BeastParser(64 * 1024, { native: false });
    const received: BeastFrame[] = [];
    for (const testcase of fixtures.valid) {
      for (const byte of Buffer.from(testcase.hex, "hex")) {
        received.push(...parser.push(Buffer.from([byte])));
      }
    }
    expect(received).toHaveLength(fixtures.valid.length);
    expect(received.map(frame => frame.payload.toString("hex"))).toEqual(
      fixtures.valid.map(testcase => testcase.modeS),
    );
  });

  it.each(fixtures.invalid.filter(testcase => testcase.expected !== "bad_crc"))(
    "rejects or defers invalid V2 envelope $name", (testcase) => {
      const parser = new BeastParser(64 * 1024, { native: false });
      expect(parser.push(Buffer.from(testcase.hex, "hex"))).toHaveLength(0);
      expect(parser.bufferedBytes).toBeLessThanOrEqual(parser.maxBufferedBytes);
    },
  );

  it("rejects the V2 bad-CRC DF17 without creating a fake aircraft", () => {
    const bad = fixtures.invalid.find(testcase => testcase.name === "bad_df17_parity")!;
    const decoder = new BeastDecoder(receiver);
    expect(decoder.decode(parse(bad.hex), 1_000)).toBeNull();
    expect(decoder.getTrackCount()).toBe(0);
  });

  it("accepts the V2 known CRC24 DF17 vector", () => {
    const payload = Buffer.from(fixtures.knownCrc.data + fixtures.knownCrc.parity, "hex");
    const frame: BeastFrame = { type: 0x33, timestamp: Buffer.alloc(6), signal: 40, payload };
    expect(new BeastDecoder(receiver).decode(frame, 1_000)?.icaoHex).toBe("40621D");
  });

  it("reconstructs the V2 reference CPR pair without receiver-relative guesses", () => {
    const even = fixtures.valid.find(testcase => testcase.name === fixtures.cprPair.even)!;
    const odd = fixtures.valid.find(testcase => testcase.name === fixtures.cprPair.odd)!;
    const decoder = new BeastDecoder(receiver);
    expect(decoder.decode(parse(even.hex), 1_000)).not.toBeNull();
    const aircraft = decoder.decode(parse(odd.hex), 2_000);
    const { lat, lon, toleranceDegrees } = fixtures.cprPair.decodeReference;
    expect(aircraft?.lat).not.toBeNull();
    expect(aircraft?.lon).not.toBeNull();
    expect(Math.abs((aircraft?.lat ?? Number.NaN) - lat)).toBeLessThan(toleranceDegrees);
    expect(Math.abs((aircraft?.lon ?? Number.NaN) - lon)).toBeLessThan(toleranceDegrees);
  });
});
