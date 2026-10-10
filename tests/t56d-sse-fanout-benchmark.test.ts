import { describe, expect, it } from "vitest";
import { runT56dSseScenario, syntheticSseFrames } from "../scripts/t56d-sse-fanout-benchmark";

describe("T5.6D isolated SSE V2 fanout", () => {
  it("generates immutable frames with a fixed number of aircraft", () => {
    const snapshots = syntheticSseFrames(10, 0.2, 3);
    expect(snapshots).toHaveLength(4);
    expect(snapshots.every((snapshot) => snapshot.aircraft.length === 10)).toBe(true);
    expect(snapshots[0]!.aircraft[0]!.altitude).not.toBe(snapshots[1]!.aircraft[0]!.altitude);
    expect(snapshots[0]!.aircraft[0]!.altitude).toBe(snapshots[0]!.aircraft[0]!.baroAltitude);
    expect(snapshots[0]!.receiver).toMatchObject({ lat: null, lon: null });
  });

  it("keeps the per-client event count and bounded 2% changed payload", () => {
    const result = runT56dSseScenario(20, 2, 0.05, 2, 3);
    expect(result).toMatchObject({
      aircraft: 20, clients: 2, frames: 3,
      deltaEvents: 6,
      changedAircraftOccurrences: 6,
    });
    expect(result.wireBytesPerRun).toBeGreaterThan(0);
    expect(result.cpuMsMedian).toBeGreaterThanOrEqual(0);
  });

  it("models an entirely disconnected baseline without synthetic network events", () => {
    const result = runT56dSseScenario(10, 0, 0.2, 1, 2);
    expect(result.deltaEvents).toBe(0);
    expect(result.changedAircraftOccurrences).toBe(0);
    expect(result.wireBytesPerRun).toBe(0);
  });

  it("rejects unbounded benchmark inputs", () => {
    expect(() => syntheticSseFrames(0)).toThrow("invalid_sse_benchmark_parameters");
    expect(() => syntheticSseFrames(5001)).toThrow("invalid_sse_benchmark_parameters");
    expect(() => runT56dSseScenario(10, 21)).toThrow("invalid_sse_fanout");
  });
});
