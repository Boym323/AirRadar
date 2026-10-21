import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

describe("retired O14 repository metadata automation", () => {
  it("does not ship the automatic changelog/code-growth PR workflow or generator", () => {
    for (const path of [
      ".github/workflows/repository-metadata.yml",
      ".github/workflows/codebase-metrics.yml",
      ".github/workflows/changelog-sync.yml",
      "scripts/code-metrics.mjs",
      "docs/metrics/code-history.json",
      "docs/metrics/code-growth.svg",
    ]) expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(false);
  });

  it("keeps PR validation, checked feature registry and release gates", () => {
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("npm run features:check");
    expect(ciWorkflow).toContain("npm run changelog:check");
    expect(ciWorkflow).toContain("node scripts/release-scope.mjs --stdin0");
    expect(ciWorkflow).toContain("Deploy production");
  });
});
