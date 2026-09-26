import { describe, expect, it } from "vitest";
import {
  classifyPath,
  countNonEmptyLines,
  renderSvg,
} from "../scripts/code-metrics.mjs";

describe("code metrics", () => {
  it("separates production and test code", () => {
    expect(classifyPath("lib/server/aircraft-state.ts")).toBe("production");
    expect(classifyPath("tests/aircraft-state.test.ts")).toBe("tests");
    expect(classifyPath("lib/server/__tests__/state.spec.ts")).toBe("tests");
    expect(classifyPath("vitest.config.ts")).toBe("tests");
  });

  it("excludes non-maintained code inputs", () => {
    expect(classifyPath("migrations/app/001_init.sql")).toBeNull();
    expect(classifyPath("public/maplibre-worker.js")).toBeNull();
    expect(classifyPath("docs/example.ts")).toBeNull();
    expect(classifyPath(".github/workflows/ci.yml")).toBeNull();
  });

  it("counts only non-empty physical lines", () => {
    expect(countNonEmptyLines("const a = 1;\n\n// comment\n  \nconst b = 2;\n")).toBe(3);
  });

  it("renders both chart series", () => {
    const svg = renderSvg({
      snapshots: [
        {
          timestamp: "2026-09-26T20:00:00.000Z",
          production: { files: 10, loc: 1200 },
          tests: { files: 4, loc: 350 },
        },
      ],
    });

    expect(svg).toContain("Production 1,200");
    expect(svg).toContain("Tests 350");
    expect(svg).toContain("#0969da");
    expect(svg).toContain("#8250df");
  });
});
