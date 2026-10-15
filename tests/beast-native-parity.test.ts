import { describe, expect, it } from "vitest";
import { BeastParser } from "@/lib/server/beast-parser";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

const enabled = process.env.AIRRADAR_NATIVE_BEAST === "1";

function frame(payload: Buffer, type: 0x31 | 0x32 | 0x33): Buffer {
  const raw = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 190]), payload]);
  const escaped: number[] = [];
  for (const byte of raw) { escaped.push(byte); if (byte === 0x1a) escaped.push(byte); }
  return Buffer.from([0x1a, type, ...escaped]);
}

// Deterministic PRNG: CI reproduces the same full and fragmented corpus.
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
}

describe.skipIf(!enabled)("Rust BEAST differential parity", () => {
  it("loads the N-API addon for this CI gate", () => {
    expect(getNativeBeastEngine()).not.toBeNull();
  });

  it("matches TS parser under random payloads, noise, invalid types and fragmentation", () => {
    const rng = random(0xa1b2c3d4);
    for (let trial = 0; trial < 50; trial += 1) {
      const ts = new BeastParser(64 * 1024, { native: false });
      const native = new BeastParser(64 * 1024);
      const chunks: Buffer[] = [];
      for (let i = 0; i < 80; i += 1) {
        const type = ([0x31, 0x32, 0x33] as const)[rng() % 3]!;
        const length = type === 0x31 ? 2 : type === 0x32 ? 7 : 14;
        const payload = Buffer.alloc(length);
        for (let p = 0; p < length; p += 1) payload[p] = rng() % 6 === 0 ? 0x1a : rng() & 255;
        if (rng() % 5 === 0) chunks.push(Buffer.from([0x1a, 0x7f, 1, 2, 3]));
        chunks.push(frame(payload, type));
      }
      const input = Buffer.concat(chunks);
      let pos = 0;
      while (pos < input.length) {
        const take = Math.min(input.length - pos, 1 + (rng() % 64));
        const part = input.subarray(pos, pos + take);
        expect(native.push(part)).toEqual(ts.push(part));
        expect(native.bufferedBytes).toBe(ts.bufferedBytes);
        pos += take;
      }
    }
  });

  it("matches the TS BigInt CRC for valid lengths and corrupted frames", () => {
    const rust = getNativeBeastEngine();
    expect(rust).not.toBeNull();
    if (!rust) throw new Error("Rust addon missing");
    const rng = random(0x55aa55aa);
    for (const length of [7, 14]) {
      for (let i = 0; i < 5000; i += 1) {
        const payload = Buffer.alloc(length);
        for (let j = 0; j < length; j += 1) payload[j] = rng() & 255;
        let bits = 0n;
        for (const value of payload) bits = (bits << 8n) | BigInt(value);
        for (let bit = length * 8 - 1; bit >= 24; bit -= 1) {
          if ((bits >> BigInt(bit)) & 1n) bits ^= 0xfff409n << BigInt(bit - 24);
        }
        expect(rust.modeSCrc(payload)).toBe(Number(bits & 0xffffffn));
      }
    }
  });
});
