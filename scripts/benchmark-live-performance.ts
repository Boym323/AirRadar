import { performance } from "node:perf_hooks";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { AircraftStateService } from "@/lib/server/aircraft-state";
import { toPublicLiveStateSnapshot, getPublicAircraftChangeSet } from "@/lib/server/public-serialization";
import { SseDeltaEncoder } from "@/lib/server/sse-delta";
import { mergeAircraftMaps, mergeAircraftObservations } from "@/lib/aircraft/source-merge";
import type { AircraftProvider } from "@/lib/server/provider";
import type { Aircraft, ProviderSnapshot, PublicStateSnapshot } from "@/lib/aircraft/types";

const receiver = { lat: 50, lon: 14, name: "Performance fixture" };

function fixtureAircraft(count: number): Aircraft[] {
  return Array.from({ length: count }, (_, index) => {
    const item = normalizeAircraft({
      hex: (index + 1).toString(16).padStart(6, "0"),
      flight: `TEST${String(index).padStart(4, "0")}`,
      lat: 49.5 + (index % 100) / 1000,
      lon: 13.5 + Math.floor(index / 100) / 1000,
      alt_baro: 10_000 + index,
      gs: 350,
      track: index % 360,
      seen: 0,
      seen_pos: 0,
      messages: 100 + index,
    }, receiver);
    if (!item) throw new Error(`fixture aircraft ${index} could not be normalized`);
    return item;
  });
}

function provider(snapshot: ProviderSnapshot): AircraftProvider {
  return { name: "benchmark", getSnapshot: async () => snapshot };
}

function buildService(aircraft: Aircraft[]): AircraftStateService {
  const snapshot: ProviderSnapshot = {
    aircraft,
    receiver,
    fetchedAt: new Date().toISOString(),
    provider: "benchmark",
    messagesPerSecond: 1_000,
  };
  const service = new AircraftStateService(provider(snapshot));
  (service as unknown as { applySnapshot: (value: ProviderSnapshot) => void }).applySnapshot(snapshot);
  return service;
}

function fanoutBenchmark(count: number, clients: number, coverage: "local" | "extended") {
  const service = buildService(fixtureAircraft(count));
  const releases = Array.from({ length: clients }, () => service.subscribe(() => undefined, { coverage }));
  const before = service.getSnapshotCacheDiagnostics();
  const startedAt = performance.now();
  for (let index = 0; index < 20; index += 1) (service as unknown as { notify: () => void }).notify();
  const elapsedMs = performance.now() - startedAt;
  const after = service.getSnapshotCacheDiagnostics();
  for (const release of releases) release();
  return { count, clients, coverage, elapsedMs: Math.round(elapsedMs * 100) / 100, buildsBefore: before.builds[coverage], buildsAfter: after.builds[coverage], cachedSnapshots: after.cachedSnapshots };
}

function sseBenchmark(count: number, clients: number) {
  const service = buildService(fixtureAircraft(count));
  const internal = service.getSnapshot();
  const initial = toPublicLiveStateSnapshot(internal, "hidden");
  const changedAircraft = initial.aircraft.map((aircraft, index) => index === 0 ? { ...aircraft, altitude: (aircraft.altitude ?? 0) + 100 } : aircraft);
  const next: PublicStateSnapshot = { ...initial, aircraft: changedAircraft };
  const encoders = Array.from({ length: clients }, () => new SseDeltaEncoder());
  for (const encoder of encoders) encoder.next(initial);
  const startedAt = performance.now();
  const events = encoders.map((encoder) => encoder.next(next));
  const elapsedMs = performance.now() - startedAt;
  const sharedDelta = getPublicAircraftChangeSet(initial, next);
  return {
    count,
    clients,
    elapsedMs: Math.round(elapsedMs * 100) / 100,
    changed: events[0]?.event === "delta" ? events[0].payload.changed.length : -1,
    sharedChanged: sharedDelta.changed.length,
    changedPayloadBytes: events[0] && events[0].event === "delta" ? Buffer.byteLength(JSON.stringify(events[0].payload)) : -1,
  };
}

function detailLookupBenchmark(count: number) {
  const aircraft = fixtureAircraft(count);
  const local = new Map(aircraft.map((item) => [item.icaoHex, item]));
  const network = new Map(aircraft.map((item) => [item.icaoHex, { ...item, origin: "adsblol" as const }]));
  const target = aircraft.at(-1)!.icaoHex;
  const options = { localStaleAfterMs: 15_000, networkStaleAfterMs: 60_000 };
  const iterations = 20;
  const beforeStarted = performance.now();
  for (let index = 0; index < iterations; index += 1) mergeAircraftMaps(local, network, receiver, options).find((item) => item.icaoHex === target);
  const beforeMs = performance.now() - beforeStarted;
  const afterStarted = performance.now();
  for (let index = 0; index < iterations; index += 1) mergeAircraftObservations(local.get(target), network.get(target), receiver, options);
  const afterMs = performance.now() - afterStarted;
  return { count, iterations, beforeMs: Math.round(beforeMs * 100) / 100, afterMs: Math.round(afterMs * 100) / 100, speedup: Math.round((beforeMs / Math.max(afterMs, 0.001)) * 100) / 100 };
}

// Keep these sizes aligned with the runtime audit contract. The benchmark is
// intentionally report-only; hosted runner wall-clock values are informative.
const counts = [100, 1_000, 5_000];
const results = [
  ...counts.map(detailLookupBenchmark),
  ...counts.flatMap((count) => [fanoutBenchmark(count, 1, "local"), fanoutBenchmark(count, 20, "local")]),
  ...counts.map((count) => fanoutBenchmark(count, 20, "extended")),
  ...counts.map((count) => sseBenchmark(count, 20)),
];
console.log(JSON.stringify(results, null, 2));
process.exit(0);
