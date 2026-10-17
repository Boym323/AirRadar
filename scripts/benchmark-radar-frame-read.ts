import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const sizes = [64 * 1024, 1024 * 1024, 8 * 1024 * 1024];
const runs = 30;
const root = await mkdtemp(path.join(process.cwd(), ".tmp-radar-frame-benchmark-"));

try {
  for (const size of sizes) {
    const file = path.join(root, `${size}.png`);
    await writeFile(file, Buffer.alloc(size, 0x01));
    const measure = async (copy: boolean) => {
      const samples: number[] = [];
      let total = 0;
      for (let run = 0; run < runs; run += 1) {
        const started = performance.now();
        const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(file));
        const result = copy ? new Uint8Array(bytes) : bytes;
        total += result.byteLength;
        samples.push(performance.now() - started);
      }
      samples.sort((left, right) => left - right);
      return { p50Ms: samples[Math.floor(samples.length * 0.5)], p95Ms: samples[Math.floor(samples.length * 0.95)], maxMs: samples.at(-1), total };
    };
    console.log(JSON.stringify({ size, runs, baselineCopy: await measure(true), candidateBuffer: await measure(false) }));
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
