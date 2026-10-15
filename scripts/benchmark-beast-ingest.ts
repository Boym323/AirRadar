/**
 * Report-only end-to-end-ish BEAST stream parser + existing stateful decoder.
 * Compare JS framing, Rust framing+per-message CRC and batched Rust CRC.
 * Does not represent upstream feeds, PostgreSQL, SSE or production memory.
 */
import { performance } from "node:perf_hooks";
import { BeastDecoder } from "@/lib/server/beast-decoder";
import { BeastParser } from "@/lib/server/beast-parser";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

if (!getNativeBeastEngine()) throw new Error("Native addon is required.");
type Mode = "typescript-parser" | "rust-separate-crc" | "rust-batched-crc";
const receiver = { lat: 50, lon: 14, name: "benchmark" };
const observedAt = Date.parse("2026-10-15T12:00:00Z");

function encoded(payload: Buffer): Buffer {
  const out = [0x1a, 0x33];
  for (const byte of Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 0, 180]), payload])) {
    out.push(byte);
    if (byte === 0x1a) out.push(byte);
  }
  return Buffer.from(out);
}
const cases = [
  "8d4840d6202cc371c32ce0576098",
  "8d4840d6202cc371c32ce0576099", // invalid CRC
  "8d40621d58c382d690c8ac2863a7",
  "8d40621d58c386435cc412692ad6",
  "8d485020994409940838175b284f",
].map((hex) => encoded(Buffer.from(hex, "hex")));
const input = Buffer.concat(Array.from({ length: 10_000 }, (_, i) => cases[i % cases.length]!));
const chunks = [];
for (let i = 0; i < input.length; i += 4096) chunks.push(input.subarray(i, i + 4096));

function sample(mode: Mode) {
  const parser = new BeastParser(64 * 1024, {
    native: mode !== "typescript-parser",
    precomputeCrc: mode === "rust-batched-crc",
  });
  const decoder = new BeastDecoder(receiver);
  const baselineCpu = process.cpuUsage();
  const started = performance.now();
  let accepted = 0;
  let frames = 0;
  for (const chunk of chunks) {
    for (const frame of parser.push(chunk)) {
      frames += 1;
      if (decoder.decode(frame, observedAt)) accepted += 1;
    }
  }
  const elapsedMs = performance.now() - started;
  const cpu = process.cpuUsage(baselineCpu);
  // A live snapshot derives seenSeconds from Date.now(), not the fixed
  // input observation time. Exclude only that time-of-check field.
  const snapshot = JSON.stringify(
    decoder.snapshot(observedAt + 1).map((item) => ({ ...item, seenSeconds: 0 })),
  );
  if (frames !== 10_000 || parser.bufferedBytes !== 0) throw new Error("Unconsumed or missing frames");
  return { elapsedMs, cpuMs: (cpu.user + cpu.system) / 1000, accepted, snapshot };
}
function median(xs: number[]) {
  const sorted = [...xs].sort((a, b) => a - b);
  return (sorted[2]! + sorted[3]!) / 2;
}
const modes: Mode[] = ["typescript-parser", "rust-separate-crc", "rust-batched-crc"];
for (const mode of modes) sample(mode);
const report: Record<Mode, { elapsedMs: number[]; cpuMs: number[] }> = {
  "typescript-parser": { elapsedMs: [], cpuMs: [] },
  "rust-separate-crc": { elapsedMs: [], cpuMs: [] },
  "rust-batched-crc": { elapsedMs: [], cpuMs: [] },
};
for (let round = 0; round < 6; round += 1) {
  const first = sample(modes[round % 3]!);
  // Run the two remaining modes cyclically, rotating order to reduce bias.
  for (let j = 0; j < 3; j += 1) {
    const mode = modes[(round + j) % 3]!;
    const outcome = j === 0 ? first : sample(mode);
    if (outcome.accepted !== first.accepted || outcome.snapshot !== first.snapshot) {
      throw new Error("Native decoder semantic mismatch");
    }
    report[mode].elapsedMs.push(outcome.elapsedMs);
    report[mode].cpuMs.push(outcome.cpuMs);
  }
}
console.log(JSON.stringify({
  kind: "report-only synthetic BEAST parsing+stateful decode, not production",
  frames: 10_000,
  wireBytes: input.length,
  chunkBytes: 4096,
  trials: 6,
  results: Object.fromEntries(modes.map((mode) => [mode, {
    medianWallMs: median(report[mode].elapsedMs),
    medianCpuMs: median(report[mode].cpuMs),
  }])),
}, null, 2));
