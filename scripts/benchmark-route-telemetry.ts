import { performance } from "node:perf_hooks";
import { RouteEnrichmentTelemetry } from "@/lib/server/route-enrichment-telemetry";

const events = Math.max(10_000, Number(process.env.ROUTE_TELEMETRY_BENCH_EVENTS ?? 250_000));
const rounds = Math.max(3, Number(process.env.ROUTE_TELEMETRY_BENCH_ROUNDS ?? 7));
const now = Date.parse("2026-10-15T12:00:00.000Z");

function runRound(): number {
  const telemetry = new RouteEnrichmentTelemetry(null, () => now);
  const started = performance.now();
  for (let index = 0; index < events; index += 1) telemetry.record("ramHit");
  return performance.now() - started;
}

for (let index = 0; index < 2; index += 1) runRound();
const durationsMs = Array.from({ length: rounds }, runRound).sort((a, b) => a - b);
const medianMs = durationsMs[Math.floor(durationsMs.length / 2)] ?? 0;

process.stdout.write(JSON.stringify({
  benchmark: "route-telemetry-record",
  events,
  rounds,
  medianMs,
  nsPerEvent: (medianMs * 1_000_000) / events,
  durationsMs,
}, null, 2) + "\n");
