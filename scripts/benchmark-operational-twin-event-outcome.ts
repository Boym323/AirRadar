import { performance } from "node:perf_hooks";
import { OperationalTwinEventOutcomeValidator, type OperationalTwinSituation } from "@/lib/operational-twin";
import type { Aircraft } from "@/lib/aircraft/types";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const PENDING = 6_000;

function pendingSituation(index: number): OperationalTwinSituation {
  return {
    generatedAt: new Date(NOW).toISOString(),
    aircraft: { icaoHex: "ABC123" },
    events: [{
      type: "WAYPOINT",
      at: new Date(NOW + 30 * 60_000).toISOString(),
      title: `WAYPOINT-${index}`,
      lat: 49,
      lon: 17.5,
      confidence: "HIGH",
      provenance: "PREDICTED",
    }],
  } as unknown as OperationalTwinSituation;
}

function localTruth(): Aircraft {
  return {
    icaoHex: "ABC123",
    lat: 49,
    lon: 17.5,
    lastSeen: new Date(NOW).toISOString(),
    seenSeconds: 0,
    seenPosSeconds: 0,
    trail: Array.from({ length: 120 }, (_, index) => ({
      recordedAt: new Date(NOW - (120 - index) * 1_000).toISOString(),
      lat: 49,
      lon: 17.5,
      altitude: 30_000,
      track: 90,
      groundSpeed: 420,
    })),
  } as unknown as Aircraft;
}

function run(): { pending: number; localAircraft: number; iterations: number; p50Ms: number; p95Ms: number } {
  const validator = new OperationalTwinEventOutcomeValidator();
  for (let index = 0; index < PENDING; index += 1) {
    const situation = pendingSituation(index);
    situation.aircraft.icaoHex = "ABC123";
    validator.capture(situation, { atcDataset: null, sigmets: null, destination: null });
  }

  const local = new Map([["ABC123", localTruth()]]);
  const samples = Array.from({ length: 9 }, () => {
    const started = performance.now();
    validator.observeLocal(local, NOW + 60_000);
    return performance.now() - started;
  }).slice(2);
  const sorted = samples.slice().sort((left, right) => left - right);
  return {
    pending: PENDING,
    localAircraft: local.size,
    iterations: samples.length,
    p50Ms: Number(sorted[Math.floor(sorted.length * 0.5)]!.toFixed(3)),
    p95Ms: Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!.toFixed(3)),
  };
}

console.log(JSON.stringify(run(), null, 2));
