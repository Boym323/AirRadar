import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aircraftStateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const alertEngineSource = readFileSync(new URL("../lib/server/alert-engine.ts", import.meta.url), "utf8");
const evaluatorSource = readFileSync(new URL("../lib/watchlist-predictive-alerts-v2.ts", import.meta.url), "utf8");

describe("Watchlist & Alerts V2 predictive boundary", () => {
  it("uses the same PUBLIC advisory builders and readiness enforcement as aircraft prediction API", () => {
    expect(aircraftStateSource).toContain("readPredictiveReadinessReport");
    expect(aircraftStateSource).toContain("enforcePredictiveReadiness");
    expect(aircraftStateSource).toContain("buildPublicEtaAdvisory");
    expect(aircraftStateSource).toContain("buildPublicRunwayChangeAdvisory");
    expect(aircraftStateSource).not.toContain("buildAdminEtaAdvisoryPreview");
    expect(aircraftStateSource).not.toContain("buildAdminRunwayChangeAdvisoryPreview");
  });

  it("does not expose predictive alert generation to SHADOW state", () => {
    expect(alertEngineSource).toContain("observePredictiveAdvisories");
    expect(alertEngineSource).not.toContain("PredictiveStateStore");
    expect(evaluatorSource).not.toContain("SHADOW");
    expect(evaluatorSource).not.toContain("readiness");
  });

  it("performs one readiness evaluation for a batch, not one per aircraft", () => {
    const method = aircraftStateSource.slice(
      aircraftStateSource.indexOf("private schedulePredictiveWatchlistAlerts"),
      aircraftStateSource.indexOf("private applyNetworkSnapshot"),
    );
    expect(method.match(/readPredictiveReadinessReport\(/g)).toHaveLength(1);
    expect(method).toContain("for (const candidate of candidates)");
  });

  it("keeps predictive events on the existing alert ledger and notifier path", () => {
    expect(alertEngineSource).toContain('"predictive_eta"');
    expect(alertEngineSource).toContain('"predictive_runway_change"');
    expect(alertEngineSource).toContain("this.enqueue({");
    expect(alertEngineSource).toContain("this.rememberPermanentEvent(candidate.eventKey)");
  });
});
