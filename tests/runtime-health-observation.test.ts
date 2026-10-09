import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeHealthObservation, startRuntimeHealthObservation, stopRuntimeHealthObservation } from "@/lib/server/runtime-health-observation";

describe("opt-in runtime health observation", () => {
  afterEach(() => stopRuntimeHealthObservation());

  it("is disabled by default and returns finite memory metrics", () => {
    const snapshot = getRuntimeHealthObservation();
    expect(snapshot.status).toBe("disabled");
    expect(snapshot.eventLoopLagP95Ms).toBeNull();
    expect(snapshot.heapUsedBytes).toBeGreaterThan(0);
  });

  it("starts and stops idempotently without retaining observers", () => {
    startRuntimeHealthObservation();
    startRuntimeHealthObservation();
    const snapshot = getRuntimeHealthObservation();
    expect(snapshot.status).toBe("enabled");
    expect(snapshot.gcSampleCount).toBeLessThanOrEqual(64);
    stopRuntimeHealthObservation();
    expect(getRuntimeHealthObservation().status).toBe("disabled");
  });
});
