import { performance } from "node:perf_hooks";
import { OperationalTwinForensics } from "@/lib/operational-twin/forensics";

const ITERATIONS = 300_000;
const ROUNDS = 7;
const trail = Array.from({ length: 120 }, (_, index) => ({ time: index, lat: 49 + index / 1_000, lon: 18.5 }));

function run(mode: "baseline" | "disabled" | "enabled"): { samples: number[]; diagnostics: OperationalTwinForensics } {
  const enabled = mode === "enabled";
  const diagnostics = new OperationalTwinForensics(enabled);
  const samples: number[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    let checksum = 0;
    const started = performance.now();
    for (let index = 0; index < ITERATIONS; index += 1) {
      const scan = () => {
        for (const point of trail) checksum += point.time + point.lat + point.lon;
      };
      if (mode === "baseline") scan();
      else diagnostics.measure("truthPoints", scan);
    }
    samples.push(performance.now() - started);
    if (!Number.isFinite(checksum)) throw new Error("benchmark_checksum_invalid");
  }
  return { samples: samples.slice(1).sort((a, b) => a - b), diagnostics };
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
const baselineMs = baselineRun.samples;
const disabledMs = disabled.samples;
const enabledMs = enabled.samples;
const median = (values: number[]) => values[Math.floor(values.length / 2)] ?? 0;
const baseline = median(baselineMs);
const disabledMedian = median(disabledMs);
const measured = median(enabledMs);
process.stdout.write(JSON.stringify({
  benchmark: "operational-twin-forensics-overhead",
  operation: "120-point synchronous truth-scan fixture",
  iterationsPerRound: ITERATIONS,
  warmupRounds: 1,
  measuredRounds: ROUNDS - 1,
  sampleEvery: 256,
  uninstrumentedMedianMs: Number(baseline.toFixed(3)),
  disabledDiagnosticsMedianMs: Number(disabledMedian.toFixed(3)),
  enabledMedianMs: Number(measured.toFixed(3)),
  disabledPathOverheadPercent: baseline > 0 ? Number(((disabledMedian - baseline) / baseline * 100).toFixed(3)) : null,
  enabledPathOverheadMs: Number((measured - baseline).toFixed(3)),
  enabledPathOverheadPercent: baseline > 0 ? Number(((measured - baseline) / baseline * 100).toFixed(3)) : null,
  retainedMemoryDeltaBytes: {
    heapUsed: enabledMemory.heapUsed - baselineMemory.heapUsed,
    rss: enabledMemory.rss - baselineMemory.rss,
    disabledDiagnosticsHeapDelta: disabledMemory.heapUsed - baselineMemory.heapUsed,
    boundedSampleCount: enabled.diagnostics.getBoundedSampleCount(),
  },
  percentiles: { uninstrumented: baselineMs, disabledDiagnostics: disabledMs, enabled: enabledMs },
}, null, 2) + "\n");
