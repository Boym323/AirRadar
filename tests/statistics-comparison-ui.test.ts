import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../app/statistics/page.tsx", import.meta.url), "utf8");

describe("statistics period comparison", () => {
  it("renders current and previous bounded periods with missing-value handling", () => {
    expect(source).toContain("PeriodComparison");
    expect(source).toContain("comparison.current.from");
    expect(source).toContain("comparison.previous.from");
    expect(source).toContain("value === null");
    expect(source).not.toContain("percentage");
  });
});
