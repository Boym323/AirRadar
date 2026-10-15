/** Synthetic report-only comparison; production truth-matching not rewired. */
import { performance } from "node:perf_hooks";
import { waypointWindowMatches } from "@/lib/operational-twin/native-waypoint-experiment";
import { getNativeBeastEngine } from "@/lib/server/native-acceleration";

if (!getNativeBeastEngine()) throw new Error("Native addon required");
const count = 120, batches = 500;
const points = new Float64Array(count * 2);
for (let i = 0; i < count; i += 1) {
  points[i * 2] = 49.5 + Math.sin(i * 0.11) * 0.3;
  points[i * 2 + 1] = 14.0 + Math.cos(i * 0.07) * 0.3;
}
function sample(native: boolean) {
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  let checksum = 0;
  for (let i = 0; i < batches; i += 1) {
    const matches = waypointWindowMatches(points, 49.5 + (i % 100) / 1000, 14, native);
    for (const value of matches) checksum += value;
  }
  const cpu = process.cpuUsage(cpuStart);
  return { ms: performance.now() - start, cpuMs: (cpu.user + cpu.system) / 1000, checksum };
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[2]! + sorted[3]!) / 2;
}
sample(false); sample(true);
const ts: ReturnType<typeof sample>[] = [], rust: ReturnType<typeof sample>[] = [];
for (let round = 0; round < 6; round += 1) {
  if (round % 2) { rust.push(sample(true)); ts.push(sample(false)); }
  else { ts.push(sample(false)); rust.push(sample(true)); }
}
if (ts.some((s, i) => s.checksum !== rust[i]!.checksum)) throw Error("Numeric mismatch");
console.log(JSON.stringify({ kind: "report-only experimental waypoint batch",
  pointCount: count, batches, rounds: 6,
  tsMs: median(ts.map((x) => x.ms)), rustMs: median(rust.map((x) => x.ms)),
  tsCpuMs: median(ts.map((x) => x.cpuMs)), rustCpuMs: median(rust.map((x) => x.cpuMs)) }, null, 2));
