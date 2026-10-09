import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const component = readFileSync(new URL("../components/system-status-page.tsx", import.meta.url), "utf8");
const gates = readFileSync(new URL("../scripts/production-gates.mjs", import.meta.url), "utf8");

describe("Stage E browser payload compatibility", () => {
  it("keeps /system available for an older cached readiness response", () => {
    expect(component).toContain("const truthAccuracy = report.truthAccuracy ?? null;");
    expect(component).toContain("{truthAccuracy ? <>");
    expect(component).toContain("data-testid=\"predictive-readiness\"");
  });
  it("exercises actual E metrics in the canonical production browser fixture", () => {
    expect(gates).toContain('truthAccuracy: {');
    expect(gates).toContain('version: "truth-accuracy-v1"');
    expect(gates).toContain('decision: "REVIEW_QUALITY"');
    expect(gates).toContain('airport: "LKPR"');
  });
});
