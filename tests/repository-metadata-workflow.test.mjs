import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const root = new URL("../", import.meta.url);
const ciWorkflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
describe("retired O14 repository metadata automation", () => {
  it("keeps automatic changelog and legacy metadata PR workflow retired", () => {
    for (const path of [
      ".github/workflows/repository-metadata.yml",
      ".github/workflows/codebase-metrics.yml",
      ".github/workflows/changelog-sync.yml",
      "scripts/code-metrics.mjs", "scripts/changelog.mjs",
    ]) expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(false);
  });
  it("permits isolated chart refresh without re-enabling O14", () => {
    for (const path of [
      "docs/metrics/code-history.json", "docs/metrics/code-growth.svg",
      ".github/workflows/code-growth.yml", "docs/metrics/update-code-growth.mjs",
    ]) expect(existsSync(new URL("../" + path, import.meta.url)), path).toBe(true);
  });
  it("retains CI validation, feature registry, and deployment gates", () => {
    expect(ciWorkflow).toContain("pull_request:");
    expect(ciWorkflow).toContain("npm run features:check");
    expect(ciWorkflow).toContain("npm run changelog:check");
    expect(ciWorkflow).toContain("node scripts/release-scope.mjs --stdin0");
    expect(ciWorkflow).toContain("Deploy production");
  });
});
