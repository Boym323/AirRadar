import { describe, expect, it } from "vitest";
import { BeastParser } from "@/lib/server/beast-parser";

function frame(payload: Buffer, type: 0x31 | 0x32 | 0x33 = 0x33): Buffer {
  const metadata = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 190]), payload]);
  const escaped: number[] = [];
  for (const byte of metadata) { escaped.push(byte); if (byte === 0x1a) escaped.push(0x1a); }
  return Buffer.concat([Buffer.from([0x1a, type]), Buffer.from(escaped)]);
}

describe("BeastParser", () => {
  it("parses complete and multiple frames", () => {
    const parser = new BeastParser();
    expect(parser.push(Buffer.concat([frame(Buffer.alloc(14, 1)), frame(Buffer.alloc(14, 2))]))).toHaveLength(2);
  });
  it("parses short Mode-S frames", () => {
    const parser = new BeastParser();
    const result = parser.push(frame(Buffer.from([0xa5, 0x40]), 0x31));
    expect(result).toHaveLength(1);
    expect(result[0].payload).toEqual(Buffer.from([0xa5, 0x40]));
  });
  it("handles fragmentation and escaped bytes", () => {
    const parser = new BeastParser(); const input = frame(Buffer.from([0x1a, ...new Array(13).fill(3)]));
    expect(parser.push(input.subarray(0, 5))).toHaveLength(0);
    const result = parser.push(input.subarray(5));
    expect(result).toHaveLength(1); expect(result[0].payload[0]).toBe(0x1a);
  });
  it("recovers from malformed types and bounds incomplete input", () => {
    const parser = new BeastParser(32);
    expect(parser.push(Buffer.concat([Buffer.from([0x1a, 0x99, 1, 2]), frame(Buffer.alloc(14, 4))]))).toHaveLength(1);
    parser.push(Buffer.alloc(1_000_000, 0x55)); expect(parser.bufferedBytes).toBeLessThanOrEqual(32);
  });
});
