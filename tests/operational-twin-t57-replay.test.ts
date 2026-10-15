import { describe, expect, it } from "vitest";
import { runT57Scenario, type T57Scenario } from "../scripts/benchmark-operational-twin-t57";

describe("T57 representative replay — semantic differential gate", () => {
  it("preserves outcomes at 78 local aircraft and 20 pending predictions", async () => {
    const scenario: T57Scenario = { aircraft: 78, pending: 20,
      intervalSeconds: 3, durationSeconds: 30, repeat: 0 };
    const original = await runT57Scenario(scenario, "full-scan");
    const optimized = await runT57Scenario(scenario, "incremental");
    expect(original.initializedPending).toBe(20);
    expect(optimized.initializedPending).toBe(20);
    expect(optimized.semantic).toEqual(original.semantic);
    expect(optimized.performance.observeCalls).toBe(original.performance.observeCalls);
    expect(optimized.latency.p95Ms).toBeGreaterThanOrEqual(0);
    // Measurements are diagnostic only; noisy CI wall times are NOT acceptance gates.
    console.info("T57_VALIDATOR_SMOKE", JSON.stringify({
      scenario, semantics: "PASS", baseline: { cpuMs: original.cpuMs,
        p95Ms: original.latency.p95Ms, p99Ms: original.latency.p99Ms,
        atcMisses: original.atc.misses }, optimized: { cpuMs: optimized.cpuMs,
        p95Ms: optimized.latency.p95Ms, p99Ms: optimized.latency.p99Ms,
        atcMisses: optimized.atc.misses },
    }));
  }, 30_000);
});
