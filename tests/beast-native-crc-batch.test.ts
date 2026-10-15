import { describe, expect, it } from "vitest";
import { BeastDecoder } from "@/lib/server/beast-decoder";
import { BeastParser, trustedModeSCrcForFrame } from "@/lib/server/beast-parser";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

const enabled = process.env.AIRRADAR_NATIVE_BEAST === "1";
const receiver = { lat: 50, lon: 14, name: "native-test" };

function wire(payload: Buffer): Buffer {
  const escaped: number[] = [0x1a, 0x33];
  for (const byte of Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 0, 180]), payload])) {
    escaped.push(byte);
    if (byte === 0x1a) escaped.push(byte);
  }
  return Buffer.from(escaped);
}

describe.skipIf(!enabled)("Rust batched CRC and stateful BEAST decode", () => {
  it("reuses the parser's CRC only for native-authored frames, including corrupted ones", () => {
    const binding = getNativeBeastEngine();
    expect(binding).not.toBeNull();
    if (!binding) throw new Error("Rust addon required");
    const payloads = [
      Buffer.from("8d4840d6202cc371c32ce0576098", "hex"),
      Buffer.from("8d4840d6202cc371c32ce0576099", "hex"),
      Buffer.from("8d485020994409940838175b284f", "hex"),
    ];
    const parser = new BeastParser();
    const legacy = new BeastParser(64 * 1024, { native: false });
    const withoutSidecar = new BeastParser(64 * 1024, { precomputeCrc: false });
    const data = Buffer.concat(payloads.map(wire));
    const nativeFrames = [...parser.push(data.subarray(0, 17)), ...parser.push(data.subarray(17))];
    const jsFrames = legacy.push(data);
    const plainNativeFrames = withoutSidecar.push(data);
    expect(nativeFrames).toEqual(jsFrames);
    expect(nativeFrames).toEqual(plainNativeFrames);
    for (let i = 0; i < payloads.length; i += 1) {
      expect(trustedModeSCrcForFrame(nativeFrames[i]!)).toBe(binding.modeSCrc(payloads[i]!));
      expect(trustedModeSCrcForFrame(jsFrames[i]!)).toBeNull();
      expect(trustedModeSCrcForFrame(plainNativeFrames[i]!)).toBeNull();
    }
    expect(trustedModeSCrcForFrame(nativeFrames[0]!)).toBe(0);
    expect(trustedModeSCrcForFrame(nativeFrames[1]!)).not.toBe(0);
  });

  it("preserves the full stateful decode and rejection behavior across three modes", () => {
    const hex = [
      "8d4840d6202cc371c32ce0576098",
      "8d4840d6202cc371c32ce0576099",
      "8d40621d58c382d690c8ac2863a7",
      "8d40621d58c386435cc412692ad6",
      "8d485020994409940838175b284f",
    ];
    const input = Buffer.concat(hex.map((h) => wire(Buffer.from(h, "hex"))));
    const timestamp = Date.parse("2026-10-15T12:00:00Z");
    const snapshots = [];
    for (const options of [{ native: false }, { native: true, precomputeCrc: false }, { native: true, precomputeCrc: true }]) {
      const parser = new BeastParser(64 * 1024, options);
      const decoder = new BeastDecoder(receiver);
      const outcomes: Array<string | null> = [];
      for (const frame of [...parser.push(input.subarray(0, 19)), ...parser.push(input.subarray(19))]) {
        const aircraft = decoder.decode(frame, timestamp);
        outcomes.push(aircraft?.icaoHex ?? null);
      }
      snapshots.push({ outcomes, aircraft: decoder.snapshot(timestamp + 1), diagnostics: decoder.getDiagnostics() });
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
    expect(snapshots[2]!.outcomes[1]).toBeNull();
  });
});
