import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const component = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");
const gates = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");

describe("Stage E browser payload compatibility", () => {
  it("keeps /system functional after removing retired predictive readiness", () => {
    expect(component).not.toContain("PredictiveReadinessPanel");
    expect(component).not.toContain('data-testid="predictive-readiness"');
    expect(component).toContain('fetch("/api/system/status"');
  });
  it("exercises actual E metrics in the canonical production browser fixture", () => {
    expect(gates).toContain('truthAccuracy: {');
    expect(gates).toContain('version: "truth-accuracy-v1"');
    expect(gates).toContain('decision: "REVIEW_QUALITY"');
    expect(gates).toContain('airport: "LKPR"');
  });
});
