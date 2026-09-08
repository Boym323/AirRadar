import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const statisticsPageSource = readFileSync(new URL("../app/statistics/page.tsx", import.meta.url), "utf8");

describe("statistics coverage polar labels", () => {
  it("renders explicit degree labels at the four cardinal directions", () => {
    expect(statisticsPageSource).toContain('<g className="coverage-degree-labels"');
    expect(statisticsPageSource).toContain('<text x="150" y="28" textAnchor="middle">0°</text>');
    expect(statisticsPageSource).toContain('<text x="296" y="166" textAnchor="end">90°</text>');
    expect(statisticsPageSource).toContain('<text x="150" y="286" textAnchor="middle">180°</text>');
    expect(statisticsPageSource).toContain('<text x="4" y="166">270°</text>');
  });
});
