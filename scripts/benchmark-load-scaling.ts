/** Isolated synthetic 1x/2x/4x runtime load benchmark; no external I/O. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runT56dSseScenario } from "./t56d-sse-fanout-benchmark";
import { runT57Scenario } from "./benchmark-operational-twin-t57";
import { snapshotApplyBenchmark, snapshotApplyComparisonBenchmark } from "./benchmark-live-performance";

const multiplier = Number(process.env.AIRRADAR_LOAD_MULTIPLIER ?? "1");
if (![1, 2, 4].includes(multiplier)) throw new Error("invalid_load_multiplier");
const aircraft = 100 * multiplier;
const clients = 5 * multiplier;
const twinScenario = {
  aircraft: 78 * multiplier,
  pending: 20 * multiplier,
  intervalSeconds: 3 as const,
  durationSeconds: 60,
  repeat: 0,
};

const comparison = await snapshotApplyComparisonBenchmark(aircraft);
const snapshotApply = snapshotApplyBenchmark(aircraft);
const twinIncremental = await runT57Scenario(twinScenario, "incremental");
const twinFullScan = await runT57Scenario(twinScenario, "full-scan");
if (JSON.stringify(twinIncremental.semantic) !== JSON.stringify(twinFullScan.semantic)) {
  throw new Error("operational_twin_semantic_parity_failed");
}
const sse = runT56dSseScenario(aircraft, clients, 0.02, 5, 10);
const report = {
  schemaVersion: 1,
  workload: { multiplier, aircraft, twinAircraft: twinScenario.aircraft,
    twinPending: twinScenario.pending, simultaneousSseClients: clients },
  environment: { commit: process.env.GITHUB_SHA ?? "local", node: process.version,
    platform: process.platform, arch: process.arch },
  snapshotApplication: { comparison, full: snapshotApply },
  operationalTwin: {
    incremental: { latency: twinIncremental.latency, cpuMs: twinIncremental.cpuMs,
      loopMaxMs: twinIncremental.loopMaxMs, memory: twinIncremental.memory,
      operationCounters: twinIncremental.performance },
    fullScan: { latency: twinFullScan.latency, cpuMs: twinFullScan.cpuMs,
      loopMaxMs: twinFullScan.loopMaxMs, memory: twinFullScan.memory,
      operationCounters: twinFullScan.performance },
    semanticParity: true,
  },
  sseFanout: sse,
  limitations: [
    "Synthetic deterministic data only; no receiver, network, PostgreSQL, TLS, proxy, or stream backpressure.",
    "SSE clients represent concurrent subscribers sharing one Node event loop; work is synchronous fanout.",
    "Runner timings are comparative evidence for this run, not a production performance guarantee.",
  ],
};
const outDir = resolve(process.env.AIRRADAR_PERF_OUTPUT_DIR ?? ".benchmarks/load-scaling");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, `load-${multiplier}x.json`), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ output: `load-${multiplier}x.json`, workload: report.workload,
  snapshotP95Ms: snapshotApply.p95Ms, twinIncrementalP95Ms: twinIncremental.latency.p95Ms,
  sseCpuMs: sse.cpuMsMedian }, null, 2) + "\n");
