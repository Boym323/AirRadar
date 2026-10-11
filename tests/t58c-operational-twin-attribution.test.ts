import { afterEach, describe, expect, it } from "vitest";
import { AircraftStateService } from "@/lib/server/aircraft-state";
import { MockReadsbProvider } from "@/lib/server/mock-readsb-provider";
import { getRuntimePerformanceDiagnostics, resetRuntimePerformanceDiagnosticsForTests } from "@/lib/server/runtime-performance";

describe("T5.8C Operational Twin outcome attribution", () => {
  afterEach(() => resetRuntimePerformanceDiagnosticsForTests());

  it("keeps validator ordering while exposing bounded per-validator timing windows", async () => {
    const service = new AircraftStateService(
      new MockReadsbProvider({ lat: 50, lon: 14, name: "Test" }),
    );
    try {
      await service.waitForReady();
      const metrics = getRuntimePerformanceDiagnostics();
      const names = [
        "twin.outcome.truth",
        "twin.trajectoryQuality.truth",
        "twin.trajectoryQualityV2.truth",
        "twin.eventOutcome.local",
        "twin.regionalAttention.truth",
      ];
      const parent = metrics["snapshot.operationalTwin"];
      expect(parent?.calls).toBeGreaterThan(0);
      for (const name of names) {
        expect(metrics[name]?.calls).toBe(parent?.calls);
        expect(metrics[name]?.windows.length).toBeGreaterThan(0);
        expect(metrics[name]?.windows.length).toBeLessThanOrEqual(15);
      }
      expect(service.getSnapshot().aircraft.length).toBeGreaterThan(0);
    } finally {
      await service.stop();
    }
  });
});
