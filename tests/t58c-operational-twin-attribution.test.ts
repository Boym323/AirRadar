import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AircraftStateService } from "@/lib/server/aircraft-state";
import { MockReadsbProvider } from "@/tests/helpers/mock-readsb-provider";
import { getRuntimePerformanceDiagnostics, resetRuntimePerformanceDiagnosticsForTests } from "@/lib/server/runtime-performance";

describe("Retired Digital Twin snapshot hot path", () => {
  beforeEach(() => resetRuntimePerformanceDiagnosticsForTests());
  afterEach(() => resetRuntimePerformanceDiagnosticsForTests());

  it("ingests local aircraft and keeps statistics/navigation integrity without Twin validations", async () => {
    const service = new AircraftStateService(
      new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }),
    );
    try {
      await service.waitForReady();
      const metrics = getRuntimePerformanceDiagnostics();
      expect(metrics["snapshot.statistics"]?.calls).toBeGreaterThan(0);
      expect(metrics["snapshot.navigationIntegrity"]?.calls).toBeGreaterThan(0);
      for (const name of [
        "snapshot.operationalTwin",
        "twin.outcome.truth",
        "twin.trajectoryQuality.truth",
        "twin.trajectoryQualityV2.truth",
        "twin.eventOutcome.local",
        "twin.regionalAttention.truth",
      ]) {
        expect(metrics[name]).toBeUndefined();
      }
      expect(service.getSnapshot().aircraft.length).toBeGreaterThan(0);
    } finally {
      await service.stop();
    }
  });
});
