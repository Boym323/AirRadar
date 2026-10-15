/**
 * Report-only native CRC benchmark: same input buffers, alternating order.
 * Captures native-call overhead per message, not overall decode throughput.
 */
import { performance } from "node:perf_hooks";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

const binding = getNativeBeastEngine();
if (!binding) throw new Error("AIRRADAR_NATIVE_BEAST=1 and a valid native addon are required.");
const rng = (() => { let state = 0x1ab2cd34; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; }; })();
const frames: Buffer[] = [];
for (let i = 0; i < 10_000; i += 1) {
  const payload = Buffer.alloc(i % 2 === 0 ? 7 : 14);
  for (let j = 0; j < payload.length; j += 1) payload[j] = rng() & 255;
  frames.push(payload);
}
function jsCrc(payload: Buffer): number {
  let value = 0n;
  for (const byte of payload) value = (value << 8n) | BigInt(byte);
  for (let bit = payload.length * 8 - 1; bit >= 24; bit -= 1) {
    if ((value >> BigInt(bit)) & 1n) value ^= 0xfff409n << BigInt(bit - 24);
  }
  return Number(value & 0xffffffn);
}
function sample(crc: (bytes: Buffer) => number) {
  const beforeCpu = process.cpuUsage();
  const start = performance.now();
  let check = 0;
  for (const buffer of frames) check ^= crc(buffer);
  const elapsedMs = performance.now() - start;
  const cpu = process.cpuUsage(beforeCpu);
  return { elapsedMs, cpuMs: (cpu.user + cpu.system) / 1000, check };
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[2]! + sorted[3]!) / 2;
}
sample(jsCrc);
sample(binding.modeSCrc);
type Sample = ReturnType<typeof sample>;
const ts: Sample[] = [], rust: Sample[] = [];
for (let i = 0; i < 6; i += 1) {
  if (i % 2 === 0) { ts.push(sample(jsCrc)); rust.push(sample(binding.modeSCrc)); }
  else { rust.push(sample(binding.modeSCrc)); ts.push(sample(jsCrc)); }
}
if (rust.some((x, i) => x.check !== ts[i]!.check)) throw new Error("CRC checksum mismatch");
console.log(JSON.stringify({
  kind: "report-only synthetic CRC, not full ADS-B decoding",
  messages: frames.length,
  trials: 6,
  typescript: { medianWallMs: median(ts.map((x) => x.elapsedMs)), medianCpuMs: median(ts.map((x) => x.cpuMs)) },
  rust: { medianWallMs: median(rust.map((x) => x.elapsedMs)), medianCpuMs: median(rust.map((x) => x.cpuMs)) },
}, null, 2));
