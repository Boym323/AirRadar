import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
const state = readFileSync(new URL("lib/server/aircraft-state.ts", root), "utf8");
const alerts = readFileSync(new URL("lib/server/alert-engine.ts", root), "utf8");
const worker = readFileSync(new URL("lib/server/alert-delivery-worker.ts", root), "utf8");
const notifier = readFileSync(new URL("lib/server/alert-notifier.ts", root), "utf8");

describe("selected feature notification transport boundary", () => {
  it("removes P01-P15 intelligence and predictive alert adapters", () => {
    for (const source of [state, alerts]) {
      expect(source).not.toContain("observeIntelligenceEvent");
      expect(source).not.toContain("observePredictiveAdvisories");
    }
    expect(state).not.toContain("schedulePredictiveWatchlistAlerts");
    expect(state).not.toContain('measureRuntime("snapshot.predictive"');
    expect(state).not.toContain('measureRuntime("snapshot.intelligence"');
    expect(alerts).not.toContain("evaluateWatchlistPredictiveRule");
    expect(alerts).not.toContain("getPrisma");
  });

  it("keeps L11/L12 transports and existing notification queue lifecycle", () => {
    expect(state).toContain("getAlertDeliveryWorker().start()");
    expect(state).toContain("getAlertDeliveryWorker().stop()");
    expect(state).toContain("this.alerts.observe(previousAircraft, this.localAircraft)");
    expect(alerts).toContain("private enqueue(alert: AircraftAlert)");
    expect(alerts).toContain("this.notifier.send(alert)");
    expect(worker).toContain("PUSHOVER_ENDPOINT");
    expect(worker).toContain("getAlertsFleetsRepository");
    expect(notifier).toContain("push");
  });
});
