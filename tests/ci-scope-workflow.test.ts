import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("scope-aware pull request validation", () => {
  it("keeps validate as the required check while classifying cheap PRs first", async () => {
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(workflow).toContain("  pr-scope:");
    expect(workflow).toContain("name: PR scope");
    expect(workflow).toContain("node scripts/release-scope.mjs --stdin0");
    expect(workflow).toContain("  validate:");
    expect(workflow).toContain("needs: pr-scope");
  });

  it("skips npm/build work only for the release-scope allowlist", async () => {
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(workflow).toContain("Lightweight documentation and metadata validation");
    expect(workflow).toContain("needs.pr-scope.outputs.heavy == 'false'");
    expect(workflow).toContain("needs.pr-scope.outputs.heavy != 'false'");
    expect(workflow).toContain('git diff --check "${BASE_SHA}" "${HEAD_SHA}"');
  });
});
