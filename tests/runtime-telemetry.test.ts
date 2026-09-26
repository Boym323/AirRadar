import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  RuntimeTelemetryStore,
  type RuntimeTelemetrySample,
} from "@/lib/server/runtime-telemetry";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function telemetryFile(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "airradar-runtime-telemetry-"));
  roots.push(root);
  return path.join(root, "runtime-telemetry-v1.json");
}

function sample(at: number, overrides: Partial<RuntimeTelemetrySample> = {}): RuntimeTelemetrySample {
  return {
    recordedAt: new Date(at).toISOString(),
    processRssBytes: 100_000_000,
    heapUsedBytes: 40_000_000,
    cgroupMemoryCurrentBytes: 120_000_000,
    activeSseClients: 2,
    aircraftCount: 50,
    listenerCount: 3,
    databaseState: "ok",
    databaseLatencyMs: 4,
    localProviderState: "online",
    networkProviderState: "online",
    ...overrides,
  };
}

describe("runtime telemetry history", () => {
  it("persists a bounded snapshot and restores it after restart", async () => {
    let now = Date.parse("2026-09-26T06:00:00.000Z");
    const file = await telemetryFile();
    const first = new RuntimeTelemetryStore({
      file,
      now: () => now,
      maxSamples: 3,
      retentionMs: 60 * 60_000,
    });
    first.record(sample(now - 120_000));
    first.record(sample(now - 60_000));
    first.record(sample(now));
    await first.flush();

    const payload = JSON.parse(await readFile(file, "utf8")) as { schemaVersion: number; samples: unknown[] };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.samples).toHaveLength(3);

    now += 30_000;
    const second = new RuntimeTelemetryStore({
      file,
      now: () => now,
      maxSamples: 3,
      retentionMs: 60 * 60_000,
    });
    expect(second.history()).toMatchObject({
      samples: [
        expect.objectContaining({ activeSseClients: 2 }),
        expect.objectContaining({ activeSseClients: 2 }),
        expect.objectContaining({ activeSseClients: 2 }),
      ],
      diagnostics: { loadedFromDisk: true, lastLoadError: null },
    });
  });

  it("drops expired samples and keeps only the newest bounded window", async () => {
    const now = Date.parse("2026-09-26T06:00:00.000Z");
    const file = await telemetryFile();
    const store = new RuntimeTelemetryStore({
      file,
      now: () => now,
      maxSamples: 2,
      retentionMs: 10 * 60_000,
    });
    store.record(sample(now - 11 * 60_000));
    store.record(sample(now - 2 * 60_000, { aircraftCount: 10 }));
    store.record(sample(now - 60_000, { aircraftCount: 20 }));
    store.record(sample(now, { aircraftCount: 30 }));

    expect(store.history().samples.map((item) => item.aircraftCount)).toEqual([20, 30]);
  });

  it("fails closed on an oversized or malformed persisted payload", async () => {
    const now = Date.parse("2026-09-26T06:00:00.000Z");
    const file = await telemetryFile();
    await writeFile(file, "{broken", "utf8");
    const malformed = new RuntimeTelemetryStore({ file, now: () => now });
    expect(malformed.history()).toMatchObject({
      samples: [],
      diagnostics: { loadedFromDisk: false, lastLoadError: "invalid_json" },
    });
  });

  it("never exposes mutable sample references", async () => {
    const now = Date.parse("2026-09-26T06:00:00.000Z");
    const file = await telemetryFile();
    const store = new RuntimeTelemetryStore({ file, now: () => now });
    store.record(sample(now, { aircraftCount: 10 }));
    const first = store.history();
    first.samples[0]!.aircraftCount = 999;
    expect(store.history().samples[0]!.aircraftCount).toBe(10);
  });
});
