/**
 * Offline, reproducible Navigation Integrity candidate-processing comparison.
 *
 * JITI_TSCONFIG_PATHS=true jiti scripts/benchmark-navigation-integrity-candidates.ts
 *
 * Reports CPU and wall time, but deliberately has no synthetic performance
 * threshold or claim about real-world event-loop tails.
 */
import { performance } from "node:perf_hooks";
import { buildBaseline } from "@/lib/navigation-integrity/baseline";
import { detectNavigationIntegrityAnomalies, summariseCells } from "@/lib/navigation-integrity/detector";
import {
  detectNavigationIntegrityAnomaliesReference,
  summariseCellsReference,
} from "@/tests/fixtures/navigation-integrity-detector-reference";
import type { NavigationIntegrityObservation } from "@/lib/navigation-integrity/types";

const when = Date.parse("2026-10-15T10:00:00.000Z");
const now = new Date(when + 60 * 60_000);
const REPEATS = 5;
const LOOPS = 4;

function makeObservation(index: number, layout: "dense" | "fragmented" | "normal"): NavigationIntegrityObservation {
  const at = new Date(when + Math.floor(index / 20) * 10_000).toISOString();
  const dense = layout === "dense";
  const normal = layout === "normal";
  return {
    aircraftHex: `BENCH${index % 120}`, flightId: null,
    observedAt: at, receivedAt: at,
    lat: 49.1 + (dense ? index % 3 : index % 24) * 0.21,
    lon: 14.1 + (dense ? index % 2 : Math.floor(index / 24) % 24) * 0.21,
    altitudeFt: 30_000, altitudeBand: dense ? 3 : index % 5,
    nic: normal || index % 5 === 0 ? 8 : 3,
    nacP: normal || index % 7 === 0 ? 8 : 4,
    nacV: normal || index % 11 === 0 ? 3 : 1,
    sil: 3, sda: 3, gva: 3, adsbVersion: 2,
    positionSource: "ADS-B", source: index % 3 === 0 ? "NETWORK" : "LOCAL",
    provider: "readsb", quality: "HIGH", confidence: "HIGH",
    provenance: { origin: "local", positionObservedAt: at, fields: {} },
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

type Sample = { cpuMs: number; wallMs: number; output: string };
function measure(items: NavigationIntegrityObservation[], optimized: boolean, loops: number): Sample {
  const baseline = buildBaseline(items);
  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  let output = "";
  for (let i = 0; i < loops; i += 1) {
    const cells = optimized ? summariseCells(items, baseline) : summariseCellsReference(items, baseline);
    const anomalies = optimized
      ? detectNavigationIntegrityAnomalies(items, now, baseline)
      : detectNavigationIntegrityAnomaliesReference(items, now, baseline);
    output = JSON.stringify({ cells, anomalies });
  }
  const cpu = process.cpuUsage(cpuStart);
  return {
    cpuMs: (cpu.user + cpu.system) / 1_000,
    wallMs: performance.now() - wallStart,
    output,
  };
}
const results = [];
for (const layout of ["normal", "dense", "fragmented"] as const) {
  const count = 1_200;
  const items = Array.from({ length: count }, (_, index) => makeObservation(index, layout));
  const first = measure(items, false, 1), second = measure(items, true, 1);
  if (first.output !== second.output) throw new Error(`navigation_detector_parity_failed_${layout}`);
  const runs = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const before = measure(items, false, LOOPS), after = measure(items, true, LOOPS);
    if (before.output !== after.output) throw new Error(`navigation_detector_parity_failed_${layout}_${i}`);
    runs.push({ before, after });
  }
  results.push({
    layout, observations: count, loopsPerSample: LOOPS, repeats: REPEATS,
    candidateCount: JSON.parse(first.output).anomalies.length as number,
    outputParity: true,
    baselineCpuMsMedian: median(runs.map((x) => x.before.cpuMs)),
    optimizedCpuMsMedian: median(runs.map((x) => x.after.cpuMs)),
    baselineWallMsMedian: median(runs.map((x) => x.before.wallMs)),
    optimizedWallMsMedian: median(runs.map((x) => x.after.wallMs)),
  });
}
console.log(JSON.stringify({
  schemaVersion: 1,
  benchmark: "navigation-integrity-candidate-evaluation",
  nonProduction: true,
  note: "CPU/wall are report-only. No production workload replay, event-loop tail or database benchmark.",
  results,
}, null, 2));
