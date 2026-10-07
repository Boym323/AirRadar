import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aircraftStateSource = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
const predictiveStateSource = readFileSync(new URL("../lib/predictive-intelligence/state.ts", import.meta.url), "utf8");

describe("predictive runtime optimization boundary", () => {
  it("collects due prediction candidates during the existing intelligence scan", () => {
    expect(aircraftStateSource).toContain("const predictiveCandidates: Aircraft[] = []");
    expect(aircraftStateSource).toContain("if (this.isPredictiveEvaluationDue(current, snapshotAt)) predictiveCandidates.push(current)");
    expect(aircraftStateSource).toContain('measureRuntime("snapshot.predictive", predictiveCandidates.length');
    expect(aircraftStateSource).toContain("for (const current of predictiveCandidates)");
  });

  it("keeps single-aircraft predictive reads allocation-light", () => {
    expect(predictiveStateSource).toContain("for (const [key, value] of this.states)");
    expect(predictiveStateSource).not.toContain("[...this.states.entries()].filter");
    expect(predictiveStateSource).not.toContain(".sort((a, b) => b[1].evaluatedAt - a[1].evaluatedAt)");
  });
});
