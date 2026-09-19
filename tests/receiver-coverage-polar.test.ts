import { describe, expect, it } from "vitest";
import { annularSectorPath, coverageCellState, coverageRatio, polarPoint } from "@/lib/receiver-coverage-polar";

describe("receiver coverage polar geometry", () => {
  it("uses aviation bearing orientation", () => {
    expect(polarPoint(10, 0, 100)).toEqual({ x: 100, y: 90 });
    expect(polarPoint(10, 90, 100).x).toBeCloseTo(110);
    expect(polarPoint(10, 180, 100).y).toBeCloseTo(110);
    expect(polarPoint(10, 270, 100).x).toBeCloseTo(90);
  });
  it("creates sectors across zero and from the center", () => {
    expect(annularSectorPath(10, 20, 350, 360, 100)).toContain("A 20 20 0 0 1");
    expect(annularSectorPath(0, 20, 0, 10, 100)).toContain("M 100 100 L");
  });
});

describe("receiver coverage polar cell state", () => {
  it("distinguishes no data, insufficient data, and sufficient data", () => {
    expect(coverageCellState(0, 20)).toBe("NO_DATA");
    expect(coverageCellState(19, 20)).toBe("INSUFFICIENT");
    expect(coverageCellState(20, 20)).toBe("SUFFICIENT");
  });
  it("calculates factual capture ratios", () => {
    expect(coverageRatio(0, 100)).toBe(0);
    expect(coverageRatio(100, 100)).toBe(100);
    expect(coverageRatio(1299, 1830)).toBeCloseTo(70.9836065574);
    expect(coverageRatio(0, 0)).toBeNull();
  });
});
