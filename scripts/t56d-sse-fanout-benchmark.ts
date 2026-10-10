#!/usr/bin/env node
/**
 * T5.6D: deterministic, entirely local SSE V2 fanout benchmark.
 * It models the per-client delta encoder and UTF-8 serialization in
 * app/api/stream/route.ts. It deliberately does not open real connections,
 * poll readsb, access PostgreSQL or alter production process state.
 *
 * Run from a DEV checkout:
 *   JITI_TSCONFIG_PATHS=true jiti scripts/t56d-sse-fanout-benchmark.ts
 */
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { normalizeAircraft } from "@/lib/aircraft/normalize";
import { toPublicLiveStateSnapshot } from "@/lib/server/public-serialization";
import { SseDeltaEncoder } from "@/lib/server/sse-delta";
import type { Aircraft, PublicStateSnapshot, StateSnapshot } from "@/lib/aircraft/types";

const receiver = { lat: 50, lon: 14, name: "Synthetic fixture" };
const timestamp = "2026-10-10T08:00:00.000Z";
const SAMPLE_REPEATS = 5;
const FRAMES = 10;
const round = (number: number) => Number(number.toFixed(3));

function initialSnapshot(count: number): PublicStateSnapshot {
  const aircraft: Aircraft[] = Array.from({ length: count }, (_, i) => {
    const item = normalizeAircraft({
      hex: (i + 1).toString(16).padStart(6, "0"),
      flight: "SYNTHETIC",
      lat: 49.5 + (i % 100) / 1000,
      lon: 13.5 + Math.floor(i / 100) / 1000,
      alt_baro: 15000 + i, gs: 360, track: i % 360,
      seen: 0, seen_pos: 0, messages: 100 + i,
    }, receiver, new Date(timestamp));
    if (!item) throw new Error("synthetic_aircraft_invalid");
    return item;
  });
  const state: StateSnapshot = {
    aircraft,
    relevantAtcFrequencies: [],
    receiver,
    fetchedAt: timestamp,
    provider: "synthetic-only",
    sourceOnline: true,
    sourceError: null,
    lastSourceUpdate: timestamp,
    readsbOnline: true,
    lastReadsbUpdate: timestamp,
    lastError: null,
    stats: {
      currentAircraft: count, aircraftSeenToday: count, uniqueAircraftToday: count,
      maxConcurrentAircraft: count, maxDistanceKm: 50, aircraftTypes: [],
      airlines: [], messagesPerSecond: count,
    },
  };
  return toPublicLiveStateSnapshot(state, "hidden");
}

/** All frames are prepared outside the timed section to isolate SSE overhead. */
export function syntheticSseFrames(count: number, changeRatio = 0.02, frames = FRAMES): PublicStateSnapshot[] {
  if (!Number.isInteger(count) || count < 1 || count > 5000 ||
      !Number.isFinite(changeRatio) || changeRatio <= 0 || changeRatio > 1 ||
      !Number.isInteger(frames) || frames < 1 || frames > 60) {
    throw new Error("invalid_sse_benchmark_parameters");
  }
  const initial = initialSnapshot(count);
  const snapshots = [initial];
  const changed = Math.max(1, Math.floor(count * changeRatio));
  for (let frame = 0; frame < frames; frame++) {
    const previous = snapshots[snapshots.length - 1]!;
    const aircraft = previous.aircraft.slice();
    for (let change = 0; change < changed; change++) {
      const index = (frame * changed + change) % count;
      const item = aircraft[index]!;
      aircraft[index] = { ...item, altitude: (item.altitude ?? 0) + 100 };
    }
    snapshots.push({ ...previous, fetchedAt: new Date(Date.parse(timestamp) + (frame + 1) * 1000).toISOString(), aircraft });
  }
  return snapshots;
}

type Sample = { wallMs: number; cpuMs: number; bytes: number; events: number; changed: number };

function onePass(snapshots: readonly PublicStateSnapshot[], clients: number): Sample {
  const encoders = Array.from({ length: clients }, () => new SseDeltaEncoder());
  // Exclude initial snapshots: the steady-state delta fanout is the subject.
  for (const encoder of encoders) encoder.next(snapshots[0]!);
  let bytes = 0, events = 0, changed = 0;
  const cpu = process.cpuUsage();
  const started = performance.now();
  for (const snapshot of snapshots.slice(1)) {
    for (const encoder of encoders) {
      const output = encoder.next(snapshot);
      if (output.event !== "delta") throw new Error("unexpected_sse_event");
      // Equivalent payload framing/JSON/UTF-8 bytes to /api/stream.
      const frame = `event: ${output.event}\ndata: ${JSON.stringify(output.payload)}\n\n`;
      bytes += Buffer.byteLength(frame, "utf8");
      events++;
      changed += output.payload.changed.length;
    }
  }
  const wallMs = performance.now() - started;
  const usage = process.cpuUsage(cpu);
  const cpuMs = (usage.user + usage.system) / 1000;
  return { wallMs, cpuMs, bytes, events, changed };
}

function median(values: number[]): number {
  const ordered = values.slice().sort((a, b) => a - b);
  return round(ordered[Math.floor(ordered.length / 2)]!);
}

export function runT56dSseScenario(count: number, clients: number, changeRatio = 0.02, repeats = SAMPLE_REPEATS, frames = FRAMES) {
  if (!Number.isInteger(clients) || clients < 0 || clients > 20 ||
      !Number.isInteger(repeats) || repeats < 1 || repeats > 20) {
    throw new Error("invalid_sse_fanout");
  }
  const snapshots = syntheticSseFrames(count, changeRatio, frames);
  const expectedChanged = Math.max(1, Math.floor(count * changeRatio)) * clients * frames;
  onePass(snapshots, clients); // warmup
  const samples = Array.from({ length: repeats }, () => onePass(snapshots, clients));
  if (samples.some((sample) =>
    sample.events !== clients * frames || sample.changed !== expectedChanged)) {
    throw new Error("sse_fanout_parity_failed");
  }
  return {
    aircraft: count, clients, frames, changeRatio, repeats,
    deltaEvents: clients * frames,
    changedAircraftOccurrences: expectedChanged,
    wireBytesPerRun: samples[0]!.bytes,
    wallMsMedian: median(samples.map((s) => s.wallMs)),
    cpuMsMedian: median(samples.map((s) => s.cpuMs)),
  };
}

async function main() {
  const report = {
    schemaVersion: 1,
    scenario: "synthetic-sse-v2-delta-fanout",
    node: process.version,
    mode: "offline-dev-only",
    results: [100, 1000, 5000].flatMap((count) =>
      [0, 1, 5, 20].flatMap((clients) =>
        [0.02, 0.15].map((ratio) => runT56dSseScenario(count, clients, ratio)),
      ),
    ),
    warnings: [
      "Observational timing only: repeat on matched hardware and Node build.",
      "No TCP, proxy, ReadableStream backpressure, heartbeat, real receiver or DB activity is emulated.",
      "Shared fingerprint caches can warm during repeated runs; this models steady-state behavior only.",
      "Do not infer production CPU improvements or memory leaks from these synthetic results.",
    ],
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write("T5.6D SSE DEV benchmark failed.\n");
    process.exitCode = 1;
  });
}
