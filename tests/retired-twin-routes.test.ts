import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Retired Digital Twin API regression", () => {
  it("does not expose retired public/admin endpoints or load the request assembler", () => {
    for (const path of [
      "../app/api/aircraft/[hex]/situation/route.ts",
      "../app/api/admin/operational-twin/calibration/route.ts",
      "../app/api/admin/operational-twin/outcome/route.ts",
      "../app/api/admin/operational-twin/event-outcome/route.ts",
      "../app/api/admin/operational-twin/regional-attention-outcome/route.ts",
      "../app/api/admin/operational-twin/regional-attention-graduation/route.ts",
      "../lib/server/operational-twin.ts",
    ]) expect(existsSync(new URL(path, import.meta.url)), path).toBe(false);
  });

  it("retains canonical navigation integrity and historical recording without Twin calibration", () => {
    const state = readFileSync(new URL("../lib/server/aircraft-state.ts", import.meta.url), "utf8");
    expect(state).toContain("this.navigationIntegrity.observe(");
    expect(state).toContain("recordAircraftSnapshot(");
    expect(state).not.toContain("OperationalTwinCalibrationPersistence");
    expect(state).not.toContain("getOperationalTwinOutcomeReport");
    expect(state).not.toContain("operationalTwinOutcome");
    expect(state).not.toContain("regionalAttentionOutcome");
    const registry = readFileSync(new URL("../docs/features.registry.json", import.meta.url), "utf8");
    expect(registry).not.toContain('"id": "operational-digital-twin"');
  });
});
