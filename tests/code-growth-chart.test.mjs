import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyPath, countNonEmptyLines, renderSvg, upsertDailySnapshot } from "../docs/metrics/update-code-growth.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const history = JSON.parse(read("docs/metrics/code-history.json"));
const workflow = read(".github/workflows/code-growth.yml");

describe("standalone code growth history", () => {
  it("restores original data and the embedded README graph", () => {
    expect(history.schemaVersion).toBe(1);
    expect(history.snapshots.length).toBeGreaterThan(15);
    expect(read("README.md")).toContain("docs/metrics/code-growth.svg");
    expect(read("docs/metrics/code-growth.svg")).toContain("<svg");
    expect(renderSvg(history)).toContain("AirRadar codebase growth");
  });
  it("counts the established source scope", () => {
    expect(classifyPath("app/page.tsx")).toBe("production");
    expect(classifyPath("tests/foo.test.ts")).toBe("tests");
    expect(classifyPath("lib/foo.test.ts")).toBe("tests");
    expect(classifyPath("docs/metrics/update-code-growth.mjs")).toBeNull();
    expect(countNonEmptyLines("a\n  \n b\n")).toBe(2);
  });
  it("does not duplicate the same UTC calendar day", () => {
    const previous = history.snapshots.at(-1);
    const updated = { ...previous, production: {...previous.production, loc: 1234 } };
    const next = upsertDailySnapshot([previous], updated);
    expect(next).toHaveLength(1);
    expect(next[0].production.loc).toBe(1234);
  });
  it("separates chart updating from retired changelog automation", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("conclusion == 'success'");
    expect(workflow).toContain("git push origin HEAD:main");
    expect(workflow).not.toContain("CHANGELOG.md");
    expect(workflow).not.toContain("deploy/release.sh");
    for(const path of ["scripts/code-metrics.mjs",".github/workflows/repository-metadata.yml","scripts/changelog.mjs"])
      expect(existsSync(new URL(path, root))).toBe(false);
  });
});
