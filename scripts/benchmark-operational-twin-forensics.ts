import { performance } from "node:perf_hooks";
import { OperationalTwinForensics } from "@/lib/operational-twin/forensics";

const ITERATIONS = 300_000;
const WARMUP_ROUNDS = 5;
const MEASURED_ROUNDS = 8;
const ROUNDS = WARMUP_ROUNDS + MEASURED_ROUNDS;
const trail = Array.from({ length: 120 }, (_, index) => ({ time: index, lat: 49 + index / 1_000, lon: 18.5 }));

function run(mode: "baseline" | "disabled" | "enabled" | "long-guard"):
  { samples: number[]; cpuSamples: number[]; diagnostics: OperationalTwinForensics } {
  const enabled = mode === "enabled" || mode === "long-guard";
  const diagnostics = new OperationalTwinForensics({ enabled });
  const samples: number[] = [];
  const cpuSamples: number[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    let checksum = 0;
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    for (let index = 0; index < ITERATIONS; index += 1) {
      const scan = () => {
        for (const point of trail) checksum += point.time + point.lat + point.lon;
      };
      if (mode === "baseline") scan();
      else diagnostics.measure("pendingTraversal", () => diagnostics.measure("truthPoints", scan,
        { detectLongOperation: mode === "long-guard" }),
      { detectLongOperation: mode === "enabled" || mode === "long-guard" });
    }
    samples.push(performance.now() - started);
    const cpu = process.cpuUsage(cpuStarted);
    cpuSamples.push((cpu.user + cpu.system) / 1_000);
    if (!Number.isFinite(checksum)) throw new Error("benchmark_checksum_invalid");
  }
  return {
    samples: samples.slice(WARMUP_ROUNDS).sort((a, b) => a - b),
    cpuSamples: cpuSamples.slice(WARMUP_ROUNDS).sort((a, b) => a - b),
    diagnostics,
  };
}

const baselineRun = run("baseline");
const forceGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
if (!forceGc) throw new Error("benchmark_requires_expose_gc");
forceGc();
const baselineMemory = process.memoryUsage();
const disabled = run("disabled");
forceGc();
const disabledMemory = process.memoryUsage();
const enabled = run("enabled");
forceGc();
const enabledMemory = process.memoryUsage();
const longGuard = run("long-guard");
forceGc();
const longGuardMemory = process.memoryUsage();
const baselineMs = baselineRun.samples;
const disabledMs = disabled.samples;
const enabledMs = enabled.samples;
const median = (values: number[]) => values[Math.floor(values.length / 2)] ?? 0;
const baselineCpuMs = median(baselineRun.cpuSamples);
const disabledCpuMs = median(disabled.cpuSamples);
const enabledCpuMs = median(enabled.cpuSamples);
const longGuardCpuMs = median(longGuard.cpuSamples);
const baseline = median(baselineMs);
const disabledMedian = median(disabledMs);
const measured = median(enabledMs);
const guarded = median(longGuard.samples);
process.stdout.write(JSON.stringify({
  benchmark: "operational-twin-forensics-overhead",
  operation: "120-point synchronous operation; long-guard mode stress-tests every-call detection",
  iterationsPerRound: ITERATIONS,
  warmupRounds: WARMUP_ROUNDS,
  measuredRounds: MEASURED_ROUNDS,
  sampleEvery: 256,
  uninstrumentedMedianMs: Number(baseline.toFixed(3)),
  disabledDiagnosticsMedianMs: Number(disabledMedian.toFixed(3)),
  enabledMedianMs: Number(measured.toFixed(3)),
  allCallLongDetectionMedianMs: Number(guarded.toFixed(3)),
  cpuMedianMs: {
    uninstrumented: Number(baselineCpuMs.toFixed(3)),
    disabledDiagnostics: Number(disabledCpuMs.toFixed(3)),
    enabled: Number(enabledCpuMs.toFixed(3)),
    allCallLongDetection: Number(longGuardCpuMs.toFixed(3)),
  },
  disabledPathOverheadPercent: baseline > 0 ? Number(((disabledMedian - baseline) / baseline * 100).toFixed(3)) : null,
  enabledPathOverheadMs: Number((measured - baseline).toFixed(3)),
  enabledPathOverheadPercent: baseline > 0 ? Number(((measured - baseline) / baseline * 100).toFixed(3)) : null,
  allCallLongDetectionOverheadMs: Number((guarded - measured).toFixed(3)),
  allCallLongDetectionOverheadPercentOfEnabled: measured > 0 ? Number(((guarded - measured) / measured * 100).toFixed(3)) : null,
  enabledDiagnosticsCpuOverheadNsPerInvocation: ITERATIONS > 0
    ? Number(((enabledCpuMs - baselineCpuMs) * 1_000_000 / ITERATIONS).toFixed(1)) : null,
  allCallLongDetectionCpuOverheadNsPerInvocation: ITERATIONS > 0
    ? Number(((longGuardCpuMs - enabledCpuMs) * 1_000_000 / ITERATIONS).toFixed(1)) : null,
  retainedMemoryDeltaBytes: {
    heapUsed: enabledMemory.heapUsed - baselineMemory.heapUsed,
    rss: enabledMemory.rss - baselineMemory.rss,
    disabledDiagnosticsHeapDelta: disabledMemory.heapUsed - baselineMemory.heapUsed,
    allCallLongDetectionHeapDelta: longGuardMemory.heapUsed - baselineMemory.heapUsed,
    boundedSampleCount: enabled.diagnostics.getBoundedSampleCount(),
  },
  percentiles: { uninstrumented: baselineMs, disabledDiagnostics: disabledMs, enabled: enabledMs, allCallLongDetection: longGuard.samples },
}, null, 2) + "\n");
