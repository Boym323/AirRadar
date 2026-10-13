import { describe, expect, it } from "vitest";
import {
  createRuntimeMonitorState,
  observeRuntimeMonitor,
  type RuntimeMonitorState,
} from "@/lib/server/runtime-monitor";
import type { RuntimeTelemetrySample } from "@/lib/server/runtime-telemetry";

function sample(at: number, overrides: Partial<RuntimeTelemetrySample> = {}): RuntimeTelemetrySample {
  return {
    recordedAt: new Date(at).toISOString(),
    processRssBytes: 100,
    heapUsedBytes: 50,
    cgroupMemoryCurrentBytes: 100,
    activeSseClients: 1,
    aircraftCount: 10,
    listenerCount: 1,
    databaseState: "ok",
    databaseLatencyMs: 5,
    localProviderState: "online",
    networkProviderState: "online",
    processCpuPercent: 90,
    eventLoopP99Ms: 1_200,
    databaseCallP95Ms: 1_200,
    routeCacheCircuitOpen: true,
    ...overrides,
  };
}

describe("runtime monitor", () => {
  it("opens stable incidents after three consecutive breached windows", () => {
    let state: RuntimeMonitorState = createRuntimeMonitorState();
    const samples: RuntimeTelemetrySample[] = [];
    for (let index = 0; index < 3; index += 1) {
      const current = sample(index * 60_000);
      samples.push(current);
      state = observeRuntimeMonitor(state, samples, current, true, index * 60_000).state;
    }
    const current = sample(180_000);
    samples.push(current);
    const result = observeRuntimeMonitor(state, samples, current, true, 180_000);
    expect(result.alerts.map((alert) => [alert.id, alert.severity])).toEqual([
      ["runtime-cpu", "critical"],
      ["runtime-event_loop", "critical"],
      ["runtime-database_call", "critical"],
      ["runtime-route_circuit", "critical"],
    ]);
    expect(result.state.incidents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "runtime-event_loop", status: "open", occurrences: 4 }),
    ]));
  });

  it("records unavailable samples and resolves incidents without raw payloads", () => {
    const current = sample(0);
    const opened = observeRuntimeMonitor(createRuntimeMonitorState(), [current], current, true, 0).state;
    const resolved = observeRuntimeMonitor(opened, [sample(60_000, {
      processCpuPercent: 10,
      eventLoopP99Ms: 10,
      databaseCallP95Ms: 10,
      routeCacheCircuitOpen: false,
    })], null, false, 60_000);
    expect(resolved.state.unavailable).toBe(1);
    expect(resolved.state.attempts).toBe(2);
    expect(resolved.state.incidents.every((incident) => incident.status === "resolved" || incident.id === "runtime-availability")).toBe(true);
    expect(JSON.stringify(resolved.state)).not.toContain("callsign");
  });
});
