/** Offline overhead benchmark for the synchronous runtime measurement scope. */
import { performance } from "node:perf_hooks";
import { getRuntimePerformanceDiagnostics, measureRuntime, resetRuntimePerformanceDiagnosticsForTests } from "@/lib/server/runtime-performance";

const iterations = Number(process.env.RUNTIME_BENCH_ITERATIONS ?? 250_000);
if (!Number.isSafeInteger(iterations) || iterations < 10_000 || iterations > 2_000_000) {
  throw new Error("invalid_runtime_benchmark_iterations");
}
let sink = 0;
const operation = () => { sink = (sink + 1) | 0; };
const sharedCounter = () => 1;
type Mode = "baseline" | "numeric" | "shared_callback" | "per_call_closure";

function run(mode: Mode, label: string, count: number) {
  resetRuntimePerformanceDiagnosticsForTests();
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    if (mode === "baseline") operation();
    else measureRuntime(label, mode === "numeric" ? 1 : mode === "shared_callback" ? sharedCounter : () => 1, operation);
  }
  const wallMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuStart);
  const metric = getRuntimePerformanceDiagnostics()[label];
  return {
    wallMs: Number(wallMs.toFixed(3)),
    cpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
    nsPerCall: Number((wallMs * 1e6 / count).toFixed(1)),
    metric: metric ? { calls: metric.calls, processedAircraft: metric.processedAircraft,
      sampleCount: metric.samplesMs.length, windowCount: metric.windows.length,
      windowSampleCount: metric.windows[0]?.samplesMs.length ?? 0 } : null,
  };
}

const modes: Mode[] = ["baseline", "numeric", "shared_callback", "per_call_closure"];
for (const mode of modes) run(mode, `warmup.${mode}`, 20_000);
const samples = Object.fromEntries(modes.map((mode) => [mode, [] as ReturnType<typeof run>[]])) as Record<Mode, ReturnType<typeof run>[]>;
for (let repeat = 0; repeat < 7; repeat++) {
  const order = repeat % 2 ? [...modes].reverse() : modes;
  for (const mode of order) samples[mode].push(run(mode, `sample.${mode}`, iterations));
}
const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const medians = Object.fromEntries(modes.map((mode) => [mode, {
  wallMs: median(samples[mode].map((sample) => sample.wallMs)),
  cpuMs: median(samples[mode].map((sample) => sample.cpuMs)),
  nsPerCall: median(samples[mode].map((sample) => sample.nsPerCall)),
}]));
const report = {
  schemaVersion: 1,
  benchmark: "synchronous-runtime-instrumentation-overhead",
  node: process.version,
  iterations,
  repeats: 7,
  median: medians,
  incrementalCpuNsPerScope: Number((medians.numeric.nsPerCall - medians.baseline.nsPerCall).toFixed(1)),
  callbackCounterVsNumericNsPerScope: Number((medians.shared_callback.nsPerCall - medians.numeric.nsPerCall).toFixed(1)),
  perCallClosureVsSharedCallbackNsPerScope: Number((medians.per_call_closure.nsPerCall - medians.shared_callback.nsPerCall).toFixed(1)),
  boundedMetricStorage: samples.numeric.at(-1)?.metric,
  sink,
  limitations: [
    "Synthetic no-op scope; absolute percentages are misleading because the baseline operation is intentionally tiny.",
    "Short-lived closure allocation bytes are not estimated; bounded recorder retention is asserted by tests.",
    "Repeat on matched Node/runtime and hardware before applying any hot-path optimization.",
  ],
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
