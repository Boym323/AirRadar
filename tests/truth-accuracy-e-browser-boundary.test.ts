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
  it("does not synthesize retired Truth Accuracy in the browser fixture", () => {
    expect(gates).toContain("startIsolatedReadsbFixture");
    expect(gates).toContain('name: "system-desktop"');
    expect(gates).not.toContain("truthAccuracy: {");
    expect(gates).not.toContain('version: "truth-accuracy-v1"');
    expect(gates).not.toContain('decision: "REVIEW_QUALITY"');
  });
});
