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

  it("never reconstructs retired outcome/calibration validators", () => {
    for (const path of ["../lib/operational-twin/aircraft-operational-focus-outcome.ts","../lib/operational-twin/event-outcome.ts","../lib/operational-twin/outcome.ts","../lib/operational-twin/regional-attention-outcome.ts","../lib/operational-twin/regional-attention-graduation.ts","../lib/operational-twin/trajectory-quality-outcome.ts","../lib/operational-twin/trajectory-quality-outcome-v2.ts","../lib/operational-twin/trajectory-quality-graduation.ts","../lib/operational-twin/trajectory-quality-v3-graduation.ts","../lib/operational-twin/truth-first.ts","../lib/operational-twin/trajectory-quality-promotion.ts"]) {
      expect(existsSync(new URL(path, import.meta.url)), path).toBe(false);
    }
  });

  it("keeps retired map, focus, regional analytics and forensics modules absent", () => {
    for (const path of ["../lib/operational-twin/aircraft-operational-focus-change.ts","../lib/operational-twin/aircraft-operational-focus-ui.ts","../lib/operational-twin/aircraft-operational-focus.ts","../lib/operational-twin/forensics.ts","../lib/operational-twin/map.ts","../lib/operational-twin/operational-attention.ts","../lib/operational-twin/regional-focus-queue.ts","../lib/operational-twin/regional-situation.ts","../lib/operational-twin/trajectory-quality-truth.ts"]) {
      expect(existsSync(new URL(path, import.meta.url)), path).toBe(false);
    }
  });

  it("removes the abandoned Digital Twin library while retaining independent weather corridor code", () => {
    expect(existsSync(new URL("../lib/operational-twin", import.meta.url))).toBe(false);
    const weather = readFileSync(new URL("../lib/weather/corridor-intelligence.ts", import.meta.url), "utf8");
    expect(weather).not.toContain("lib/operational-twin");
    expect(weather).toContain("export interface WeatherCorridorPath");
  });

  it("does not retain isolated regional focus queue tests", () => {
    expect(existsSync(new URL("../tests/regional-focus-queue.test.ts", import.meta.url))).toBe(false);
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
