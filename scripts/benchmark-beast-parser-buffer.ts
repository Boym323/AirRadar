/** Deterministic fallback-parser benchmark; no provider or database I/O. */
import { performance } from "node:perf_hooks";
import { BeastParser } from "@/lib/server/beast-parser";

function frame(index: number): Buffer {
  const payload = Buffer.alloc(14, index & 0xff);
  const metadata = Buffer.concat([Buffer.alloc(6), Buffer.from([190]), payload]);
  const escaped: number[] = [];
  for (const byte of metadata) { escaped.push(byte); if (byte === 0x1a) escaped.push(byte); }
  return Buffer.concat([Buffer.from([0x1a, 0x33]), Buffer.from(escaped)]);
}

const frames = Number(process.env.BEAST_BENCHMARK_FRAMES ?? "20000");
const input = Buffer.concat(Array.from({ length: frames }, (_, index) => frame(index)));
const chunkSizes = [1, 16, 4096, input.length];
const rounds = 5;

function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!.toFixed(3));
}

function run(chunkSize: number) {
  const samples: number[] = [];
  let parsed = 0;
  for (let round = 0; round < rounds; round += 1) {
    const parser = new BeastParser(64 * 1024, { native: false });
    const started = performance.now();
    let count = 0;
    for (let offset = 0; offset < input.length; offset += chunkSize) {
      count += parser.push(input.subarray(offset, Math.min(input.length, offset + chunkSize))).length;
    }
    samples.push(performance.now() - started);
    if (parser.bufferedBytes !== 0 || count !== frames) throw new Error(`parser_semantic_regression:chunk=${chunkSize}:count=${count}:buffered=${parser.bufferedBytes}`);
    parsed = count;
  }
  return {
    chunkBytes: chunkSize,
    frames: parsed,
    rounds,
    p50Ms: quantile(samples, 0.5),
    p95Ms: quantile(samples, 0.95),
    maxMs: Number(Math.max(...samples).toFixed(3)),
    framesPerSecondP50: Math.round(frames / (quantile(samples, 0.5) / 1_000)),
  };
}

console.log(JSON.stringify({
  kind: "typescript BeastParser amortized buffer benchmark",
  node: process.version,
  inputBytes: input.length,
  results: chunkSizes.map(run),
  limitations: ["Synthetic valid BEAST frames; no decoder, receiver, network, database or SSE work."],
}, null, 2));
