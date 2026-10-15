/**
 * Isolated scheduling benchmark; NO provider I/O, production data or secrets.
 * Run: JITI_TSCONFIG_PATHS=true node --expose-gc node_modules/jiti/lib/jiti-cli.mjs scripts/benchmark-bounded-enrichment.ts
 *
 * This compares promise allocation / scheduling, NOT AirRadar end-to-end
 * throughput. Benchmark with actual (post-deployment) traffic separately.
 */
import { performance } from "node:perf_hooks";
import { mapSettledBounded } from "../lib/server/bounded-batch";

type Mode = "unbounded" | "bounded";
const INPUTS = Array.from({ length: 4_000 }, (_, i) => i);
const WORKERS = 24;
const ROUNDS = 5;

async function measure(mode: Mode) {
  global.gc?.();
  const heapStart = process.memoryUsage().heapUsed;
  const started = performance.now();
  let active = 0;
  let peak = 0;
  const operation = (item: number): Promise<number> => {
    active++;
    if (active > peak) peak = active;
    return new Promise<number>((resolve) => {
      setImmediate(() => {
        active--;
        resolve(item + 1);
      });
    });
  };
  const scheduled = mode === "bounded"
    ? mapSettledBounded(INPUTS, WORKERS, operation)
    : Promise.allSettled(INPUTS.map(operation));
  const heapAfterSchedule = process.memoryUsage().heapUsed;
  const settled = await scheduled;
  if (active !== 0 || settled.length !== INPUTS.length || settled.some((x, i) =>
    x.status !== "fulfilled" || x.value !== i + 1)) {
    throw new Error("benchmark_result_mismatch");
  }
  return {
    elapsedMs: +(performance.now() - started).toFixed(3),
    peakScheduled: peak,
    heapDuringScheduleKiB: +((heapAfterSchedule - heapStart) / 1024).toFixed(1),
  };
}

function median(numbers: number[]): number {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function main() {
  const results: Record<Mode, Awaited<ReturnType<typeof measure>>[]> = { unbounded: [], bounded: [] };
  for (let round = 0; round < ROUNDS; round++) {
    // Alternate order to reduce warmup bias between reference and optimization.
    const modes: Mode[] = round % 2 ? ["bounded", "unbounded"] : ["unbounded", "bounded"];
    for (const mode of modes) results[mode].push(await measure(mode));
  }
  const result = Object.fromEntries((Object.keys(results) as Mode[]).map((mode) => [mode, {
    medianElapsedMs: median(results[mode].map((item) => item.elapsedMs)),
    medianHeapDuringScheduleKiB: median(results[mode].map((item) => item.heapDuringScheduleKiB)),
    maxScheduled: Math.max(...results[mode].map((item) => item.peakScheduled)),
  }]));
  process.stdout.write(`${JSON.stringify({ fixture: "isolated-async-enrichment-4000", workers: WORKERS, rounds: ROUNDS, results: result }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`Benchmark failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
});
