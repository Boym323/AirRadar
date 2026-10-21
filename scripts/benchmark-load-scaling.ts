/** Isolated synthetic 1x/2x/4x retained runtime load benchmark; no external I/O. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runT56dSseScenario } from "./t56d-sse-fanout-benchmark";
import { snapshotApplyBenchmark } from "./benchmark-live-performance";
import { runAtcRingScenario } from "./benchmark-atc-ring-stalls";

const multiplier = Number(process.env.AIRRADAR_LOAD_MULTIPLIER ?? "1");
if (![1, 2, 4].includes(multiplier)) throw new Error("invalid_load_multiplier");
const aircraft = 100 * multiplier;
const clients = 5 * multiplier;

const snapshotApply = snapshotApplyBenchmark(aircraft);
const sse = runT56dSseScenario(aircraft, clients, 0.02, 5, 10);
const atcGeometry = await runAtcRingScenario(multiplier);
const report = {
  schemaVersion: 3,
  workload: { multiplier, aircraft, simultaneousSseClients: clients },
  environment: { commit: process.env.GITHUB_SHA ?? "local", node: process.version,
    platform: process.platform, arch: process.arch },
  snapshotApplication: { full: snapshotApply },
  sseFanout: sse,
  atcGeometry,
  limitations: [
    "Synthetic deterministic data only; no receiver, network, PostgreSQL, TLS, proxy, or stream backpressure.",
    "SSE clients represent concurrent subscribers sharing one Node event loop; work is synchronous fanout.",
    "No synthetic Digital Twin or Flight Intelligence detector timings: those algorithms are retired.",
    "Runner timings are comparative evidence for this run, not a production performance guarantee.",
  ],
};
const outDir = resolve(process.env.AIRRADAR_PERF_OUTPUT_DIR ?? ".benchmarks/load-scaling");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, `load-${multiplier}x.json`), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ output: `load-${multiplier}x.json`, workload: report.workload,
  snapshotP95Ms: snapshotApply.p95Ms, sseCpuMs: sse.cpuMsMedian }, null, 2) + "\n");
