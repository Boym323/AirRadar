import { describe, expect, it } from "vitest";
import {
  classifyPath,
  countNonEmptyLines,
  renderSvg,
  scanCodebase,
  scanCommit,
  selectDailyCommits,
  upsertDailySnapshot,
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

  it("selects the last first-parent commit from each day", () => {
    const selected = selectDailyCommits(
      [
        "aaa\t2026-09-19T08:00:00+02:00",
        "bbb\t2026-09-19T19:00:00+02:00",
        "ccc\t2026-09-20T09:00:00+02:00",
      ].join("\n"),
    );

    expect(selected).toEqual([
      {
        day: "2026-09-19",
        commit: "bbb",
        timestamp: "2026-09-19T19:00:00+02:00",
      },
      {
        day: "2026-09-20",
        commit: "ccc",
        timestamp: "2026-09-20T09:00:00+02:00",
      },
    ]);
  });

  it("keeps only the newest snapshot for a day", () => {
    const first = {
      day: "2026-09-27",
      timestamp: "2026-09-27T07:00:00.000Z",
      commit: "aaa",
      production: { files: 10, loc: 1000 },
      tests: { files: 4, loc: 300 },
      totalLoc: 1300,
    };
    const later = {
      day: "2026-09-27",
      timestamp: "2026-09-27T08:00:00.000Z",
      commit: "bbb",
      production: { files: 11, loc: 1100 },
      tests: { files: 5, loc: 350 },
      totalLoc: 1450,
    };

    expect(upsertDailySnapshot([first], later)).toEqual([later]);
  });

  it("does not add a new day when counts did not change", () => {
    const first = {
      day: "2026-09-26",
      timestamp: "2026-09-26T20:00:00.000Z",
      commit: "aaa",
      production: { files: 10, loc: 1000 },
      tests: { files: 4, loc: 300 },
      totalLoc: 1300,
    };
    const unchanged = {
      day: "2026-09-27",
      timestamp: "2026-09-27T08:00:00.000Z",
      commit: "bbb",
      production: { files: 10, loc: 1000 },
      tests: { files: 4, loc: 300 },
      totalLoc: 1300,
    };

    expect(upsertDailySnapshot([first], unchanged)).toEqual([first]);
  });

  it("scans a Git commit with the same metric as the working tree", async () => {
    expect(scanCommit("HEAD")).toEqual(await scanCodebase());
  });

  it("renders both chart series", () => {
    const svg = renderSvg({
      snapshots: [
        {
          day: "2026-09-19",
          timestamp: "2026-09-19T20:00:00.000Z",
          production: { files: 2, loc: 200 },
          tests: { files: 1, loc: 50 },
        },
        {
          day: "2026-09-26",
          timestamp: "2026-09-26T20:00:00.000Z",
          production: { files: 10, loc: 1200 },
          tests: { files: 4, loc: 350 },
        },
      ],
    });

    expect(svg).toContain("Production 1,200");
    expect(svg).toContain("Tests 350");
    expect(svg).toContain("Daily Git history");
    expect(svg).toContain("2026-09-19");
    expect(svg).toContain("#0969da");
    expect(svg).toContain("#8250df");
  });
});
