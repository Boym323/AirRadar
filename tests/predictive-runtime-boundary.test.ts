import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aircraftStateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const predictiveStateSource = readFileSync(new URL("../lib/predictive-intelligence/state.ts", import.meta.url), "utf8");

describe("predictive runtime optimization boundary", () => {
  it("keeps rejected predictive evaluation out of the live ADS-B hot path", () => {
    expect(aircraftStateSource).not.toContain("PredictiveStateStore");
    expect(aircraftStateSource).not.toContain("getPredictiveState");
    expect(aircraftStateSource).not.toContain("this.predictive.flushProspective");
    expect(aircraftStateSource).not.toContain("predictiveCandidates");
    expect(aircraftStateSource).not.toContain("isPredictiveEvaluationDue");
    expect(aircraftStateSource).not.toContain('measureRuntime("snapshot.predictive"');
    expect(aircraftStateSource).toContain("this.navigationIntegrity.observe(activeAircraft");
  });

  it("keeps single-aircraft predictive reads allocation-light", () => {
    expect(predictiveStateSource).toContain("for (const [key, value] of this.states)");
    expect(predictiveStateSource).not.toContain("[...this.states.entries()].filter");
    expect(predictiveStateSource).not.toContain(".sort((a, b) => b[1].evaluatedAt - a[1].evaluatedAt)");
  });
});
