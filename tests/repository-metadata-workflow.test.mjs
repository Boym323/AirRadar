import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const metadataWorkflow = readFileSync(
  new URL("../.github/workflows/repository-metadata.yml", import.meta.url),
  "utf8",
);
const ciWorkflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

describe("repository metadata automation", () => {
  it("replaces the two standalone metadata workflows", () => {
    expect(
      existsSync(
        new URL("../.github/workflows/codebase-metrics.yml", import.meta.url),
      ),
    ).toBe(false);
    expect(
      existsSync(
        new URL("../.github/workflows/changelog-sync.yml", import.meta.url),
      ),
    ).toBe(false);
    expect(metadataWorkflow).toContain("name: Repository Metadata");
  });

  it("runs only after successful main CI or manual dispatch", () => {
    expect(metadataWorkflow).toContain("workflow_run:");
    expect(metadataWorkflow).toContain("- CI");
    expect(metadataWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(metadataWorkflow).toContain(
      "github.event.workflow_run.head_branch == 'main'",
    );
    expect(metadataWorkflow).toContain("workflow_dispatch:");
    expect(metadataWorkflow).toContain("repository-metadata-${{");
    expect(metadataWorkflow).toContain("chore: sync repository metadata");
  });

  it("syncs changelog and metrics into one audit PR and merges it", () => {
    expect(metadataWorkflow).toContain("node scripts/changelog.mjs backfill");
    expect(metadataWorkflow).toContain("node scripts/changelog.mjs check");
    expect(metadataWorkflow).toContain(
      "node scripts/code-metrics.mjs --backfill-if-needed",
    );
    expect(metadataWorkflow).toContain(
      'branch="automation/repository-metadata"',
    );
    expect(metadataWorkflow).toContain(
      '--title "chore: sync repository metadata"',
    );
    expect(metadataWorkflow).toContain("actions: write");
    expect(metadataWorkflow).toContain("gh workflow run ci.yml");
    expect(metadataWorkflow).toContain("--event workflow_dispatch");
    expect(metadataWorkflow).toContain('gh pr merge "${pr_number}"');
    expect(metadataWorkflow).toContain("--squash");
    expect(metadataWorkflow).toContain("--delete-branch");
    expect(metadataWorkflow).not.toContain("automatic merge is disabled");
  });

  it("dispatches the lightweight required CI check for metadata PRs", () => {
    expect(ciWorkflow).toContain("workflow_dispatch:");
    expect(ciWorkflow).toContain("refs/heads/automation/repository-metadata");
    expect(ciWorkflow).toContain("dispatch-{0}");
  });

  it("keeps generated metadata merges out of production deployment", () => {
    expect(ciWorkflow).toContain("node scripts/release-scope.mjs --stdin0");
    expect(ciWorkflow).not.toContain("\n  sync-changelog:\n");
  });
});
