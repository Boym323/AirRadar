/**
 * Report-only matched TS/native BEAST parser benchmark.
 * Run with AIRRADAR_NATIVE_BEAST=1 and an absolute AIRRADAR_NATIVE_ADDON_PATH.
 * No claim about production throughput; include real ingest/decode/GC profiling.
 */
import { performance } from "node:perf_hooks";
import { BeastParser } from "@/lib/server/beast-parser";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

if (!getNativeBeastEngine()) {
  throw new Error("A compiled opt-in N-API addon is required for this comparison.");
}

let seed = 0x1234abcd;
function rng(): number {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
}
function encodeFrame(type: 0x31 | 0x32 | 0x33): Buffer {
  const length = type === 0x31 ? 2 : type === 0x32 ? 7 : 14;
  const encoded = [0x1a, type];
  for (let index = 0; index < length + 7; index += 1) {
    const value = index < 7 ? (index === 6 ? 190 : 0) : (rng() % 12 === 0 ? 0x1a : rng() & 255);
    encoded.push(value);
    if (value === 0x1a) encoded.push(value);
  }
  return Buffer.from(encoded);
}
const frames: Buffer[] = [];
for (let index = 0; index < 25_000; index += 1) {
  frames.push(encodeFrame(([0x31, 0x32, 0x33] as const)[index % 3]!));
}
const wire = Buffer.concat(frames);
const chunks: Buffer[] = [];
for (let i = 0; i < wire.length; i += 4096) chunks.push(wire.subarray(i, i + 4096));

function sample(native: boolean) {
  const parser = new BeastParser(64 * 1024, { native });
  const beforeCpu = process.cpuUsage();
  const start = performance.now();
  let count = 0;
  for (const chunk of chunks) {
    count += parser.push(chunk).length;
  }
  const ms = performance.now() - start;
  const cpu = process.cpuUsage(beforeCpu);
  if (count !== frames.length || parser.bufferedBytes !== 0) {
    throw new Error("Benchmark mismatch: lost frames or unconsumed bytes");
  }
  return { ms, cpuMs: (cpu.user + cpu.system) / 1000, framesPerSecond: Math.round(frames.length / (ms / 1000)) };
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[2]! + sorted[3]!) / 2;
}
sample(false); sample(true);
type Sample = ReturnType<typeof sample>;
const ts: Sample[] = [], rust: Sample[] = [];
for (let trial = 0; trial < 6; trial += 1) {
  if (trial % 2 === 0) {
    ts.push(sample(false)); rust.push(sample(true));
  } else {
    rust.push(sample(true)); ts.push(sample(false));
  }
}
const results = {
  kind: "report-only, synthetic, no GC baseline or production attribution",
  frames: frames.length,
  wireBytes: wire.length,
  chunkSize: 4096,
  trials: 6,
  typescript: { medianWallMs: median(ts.map((x) => x.ms)), medianCpuMs: median(ts.map((x) => x.cpuMs)) },
  rust: { medianWallMs: median(rust.map((x) => x.ms)), medianCpuMs: median(rust.map((x) => x.cpuMs)) },
};
console.log(JSON.stringify(results, null, 2));
