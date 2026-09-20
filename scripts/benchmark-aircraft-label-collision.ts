import { performance } from "node:perf_hooks";
import { layoutAircraftLabels, type AircraftLabelCollisionItem } from "@/lib/radar/aircraft-label-collision";

function fixture(count: number): AircraftLabelCollisionItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `BENCH-${index}`,
    point: { x: 80 + (index % 20) * 72, y: 60 + Math.floor(index / 20) * 44 },
    width: 48 + (index % 4) * 6,
    height: 14,
    priority: index === 0 ? "selected" : index % 7 === 0 ? "watchlisted" : "normal",
    forceVisible: index === 0,
  }));
}

const results = [25, 50, 100, 250].map((count) => {
  const items = fixture(count);
  const startedAt = performance.now();
  let result = layoutAircraftLabels(items);
  for (let run = 1; run < 100; run += 1) result = layoutAircraftLabels(items);
  const elapsedMs = performance.now() - startedAt;
  return {
    count,
    runs: 100,
    totalMs: Math.round(elapsedMs * 100) / 100,
    averageMs: Math.round((elapsedMs / 100) * 1000) / 1000,
    placed: result.placements.size,
    hidden: result.hidden.size,
  };
});

console.log(JSON.stringify(results, null, 2));
