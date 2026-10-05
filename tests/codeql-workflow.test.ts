import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("CodeQL workflow efficiency", () => {
  it("scans relevant pull requests and scheduled main without duplicate push scans", async () => {
    const workflow = await readFile(new URL("../.github/workflows/codeql.yml", import.meta.url), "utf8");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("\n  push:\n");
  });

  it("cancels stale PR scans and ignores docs-only changes", async () => {
    const workflow = await readFile(new URL("../.github/workflows/codeql.yml", import.meta.url), "utf8");
    expect(workflow).toContain("codeql-pr-");
    expect(workflow).toContain("cancel-in-progress:");
    expect(workflow).toContain('github.event_name == \'pull_request\'');
    expect(workflow).toContain('      - "**/*.md"');
    expect(workflow).toContain('      - "docs/metrics/code-history.json"');
  });
});
