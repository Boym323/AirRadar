import { afterEach, describe, expect, it, vi } from "vitest";
import { getRuntimeHealthObservation, getV8HeapSpaces, startRuntimeHealthObservation, stopRuntimeHealthObservation } from "@/lib/server/runtime-health-observation";

describe("opt-in runtime health observation", () => {
  afterEach(() => stopRuntimeHealthObservation());

  it("is disabled by default and returns finite memory metrics", () => {
    const snapshot = getRuntimeHealthObservation();
    expect(snapshot.status).toBe("disabled");
    expect(snapshot.eventLoopLagP95Ms).toBeNull();
    expect(snapshot.heapUsedBytes).toBeGreaterThan(0);
    expect(snapshot.externalBytes).toBeGreaterThanOrEqual(0);
    expect(snapshot.arrayBuffersBytes).toBeGreaterThanOrEqual(0);
    expect(snapshot.v8HeapSpaces.map((space) => space.name)).toEqual(getV8HeapSpaces().map((space) => space.name));
    expect(snapshot.v8HeapSpaces.length).toBeGreaterThan(0);
    expect(snapshot.v8HeapSpaces.length).toBeLessThanOrEqual(16);
    expect(snapshot.v8HeapSpaces.some((space) => space.name === "old_space")).toBe(true);
    for (const space of snapshot.v8HeapSpaces) {
      expect(space.name).toMatch(/^[a-z_]{1,48}$/);
      expect(space.usedBytes).toBeGreaterThanOrEqual(0);
      expect(space.sizeBytes).toBeGreaterThanOrEqual(0);
      expect(space.physicalBytes).toBeGreaterThanOrEqual(0);
    }
    expect(snapshot.majorGcCount).toBe(0);
    expect(snapshot.postMajorGc).toBeNull();
  });

  it("starts and stops idempotently without retaining observers", () => {
    startRuntimeHealthObservation();
    startRuntimeHealthObservation();
    const snapshot = getRuntimeHealthObservation();
    expect(snapshot.status).toBe("enabled");
    expect(snapshot.gcSampleCount).toBeLessThanOrEqual(64);
    expect(snapshot.gcCount).toBeGreaterThanOrEqual(snapshot.gcSampleCount);
    expect(snapshot.cpuUserTimeMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.cpuSystemTimeMs).toBeGreaterThanOrEqual(0);
    stopRuntimeHealthObservation();
    expect(getRuntimeHealthObservation().status).toBe("disabled");
    expect(getRuntimeHealthObservation().majorGcCount).toBe(0);
    expect(getRuntimeHealthObservation().postMajorGc).toBeNull();
  });

  it("shares observation state across separately evaluated module copies", async () => {
    vi.resetModules();
    const startupModule = await import("@/lib/server/runtime-health-observation");
    startupModule.startRuntimeHealthObservation();

    vi.resetModules();
    const routeModule = await import("@/lib/server/runtime-health-observation");
    expect(routeModule.getRuntimeHealthObservation().status).toBe("enabled");
    routeModule.stopRuntimeHealthObservation();
  });
});
