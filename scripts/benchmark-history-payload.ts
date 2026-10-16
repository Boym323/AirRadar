/**
 * Synthetic CPU/alloc benchmark only: no live DB, SQL, ADS-B or production.
 * Run: JITI_TSCONFIG_PATHS=true node --expose-gc node_modules/jiti/lib/jiti-cli.mjs scripts/benchmark-history-payload.ts
 */
import { performance } from "node:perf_hooks";
import type { Aircraft, AircraftEnrichment } from "@/lib/aircraft/types";
import { historyAircraftForSnapshot } from "@/lib/server/history-aircraft-payload";

function oldPayload(item: Aircraft, current: Aircraft | undefined): Aircraft {
  if (!current) return item;
  const same = current.callsign === item.callsign;
  const metadata = item.enrichment?.metadata ?? current.enrichment?.metadata;
  const route = item.enrichment?.route ?? (same ? current.enrichment?.route : undefined);
  const flightPlan = item.enrichment?.flightPlan ?? (same ? current.enrichment?.flightPlan : undefined);
  const enrichment: AircraftEnrichment = {};
  if (metadata) enrichment.metadata = metadata;
  if (route) enrichment.route = route;
  if (flightPlan) enrichment.flightPlan = flightPlan;
  return { ...item,
    registration: item.registration ?? current.registration,
    aircraftType: item.aircraftType ?? current.aircraftType,
    aircraftDescription: item.aircraftDescription ?? current.aircraftDescription,
    ...(Object.keys(enrichment).length ? { enrichment } : {}),
  };
}
const items = Array.from({ length: 256 }, (_, index) => {
  const current = { icaoHex: index.toString(16).padStart(6, "0"), callsign: "ABC123", lat: 50, lon: 14,
    registration: "OK-ABC", aircraftType: "A320", aircraftDescription: "Airbus",
  } as Aircraft;
  const item = index % 5 === 0
    ? { ...current, registration: null, aircraftType: null }
    : current;
  return { item, current };
});
for (const { item, current } of items) {
  if (JSON.stringify(oldPayload(item, current)) !== JSON.stringify(historyAircraftForSnapshot(item, current))) {
    throw new Error("history payload parity mismatch");
  }
}
function run(fn: typeof historyAircraftForSnapshot) {
  global.gc?.();
  const startHeap = process.memoryUsage().heapUsed;
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  let reused = 0;
  for (let frame = 0; frame < 150; frame++) for (const { item, current } of items) {
    if (fn(item, current) === item) reused += 1;
  }
  const cpu = process.cpuUsage(cpuStart);
  return {
    wallMs: performance.now() - start,
    cpuMs: (cpu.user + cpu.system) / 1_000,
    deltaHeapBytes: process.memoryUsage().heapUsed - startHeap,
    reused,
  };
}
run(oldPayload);run(historyAircraftForSnapshot);
const measurements = Array.from({ length: 5 }, () => ({
  baseline: run(oldPayload), optimized: run(historyAircraftForSnapshot),
}));
const median = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
const result = {
  scenario: "256 aircraft x 150 frames; 80% already hydrated",
  parity: true,
  operationsPerRun: 256 * 150,
  baselineCpuMsMedian: median(measurements.map(x => x.baseline.cpuMs)),
  optimizedCpuMsMedian: median(measurements.map(x => x.optimized.cpuMs)),
  baselineWallMsMedian: median(measurements.map(x => x.baseline.wallMs)),
  optimizedWallMsMedian: median(measurements.map(x => x.optimized.wallMs)),
  baselineReused: measurements[0]!.baseline.reused,
  optimizedReused: measurements[0]!.optimized.reused,
  baselineHeapDeltaMedianBytes: median(measurements.map(x => x.baseline.deltaHeapBytes)),
  optimizedHeapDeltaMedianBytes: median(measurements.map(x => x.optimized.deltaHeapBytes)),
  note: "Isolated synthetic helper benchmark; no claim about PostgreSQL, total CPU, GC P99 or production speedup.",
};
console.log(JSON.stringify(result, null, 2));
