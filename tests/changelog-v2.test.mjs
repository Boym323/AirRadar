import { describe, expect, it } from "vitest";
import {
  backfillChangelog,
  categorizeCommit,
  createChangelogEntry,
  featureNamesForCommits,
  formatSummarySubject,
  parseConventionalSubject,
  pruneUnexpectedChangelogVersions,
  unexpectedChangelogVersions,
} from "../scripts/changelog.mjs";

const registry = {
  features: [
    {
      name: "Flight Intelligence",
      changelogScopes: ["intelligence"],
      changelogKeywords: ["flight intelligence"],
    },
    {
      name: "Receiver Coverage",
      changelogScopes: ["receiver"],
      changelogKeywords: ["coverage analysis"],
    },
  ],
};

describe("changelog v2", () => {
  it("parses conventional commit metadata", () => {
    expect(parseConventionalSubject("feat(intelligence): add go-around detector")).toEqual({
      type: "feat",
      scope: "intelligence",
      breaking: false,
      summary: "add go-around detector",
    });
    expect(parseConventionalSubject("fix!: correct public contract")).toEqual({
      type: "fix",
      scope: null,
      breaking: true,
      summary: "correct public contract",
    });
  });

  it("categorizes release notes and hides merge commits from the summary", () => {
    expect(categorizeCommit("feat(radar): add layer")).toBe("Added");
    expect(categorizeCommit("fix(sse): bound queue")).toBe("Fixed");
    expect(categorizeCommit("perf(radar): reduce writes")).toBe("Performance");
    expect(categorizeCommit("docs: update guide")).toBe("Documentation");
    expect(categorizeCommit("chore: bump metadata")).toBe("Maintenance");
    expect(categorizeCommit("Merge pull request #123 from example")).toBeNull();
    expect(categorizeCommit("Merge remote-tracking branch 'origin/main'")).toBeNull();
  });

  it("humanizes conventional subjects", () => {
    expect(formatSummarySubject("feat(intelligence): add go-around detector.")).toBe(
      "Add go-around detector",
    );
  });

  it("maps conventional scopes to registered features", () => {
    expect(
      featureNamesForCommits(
        [
          { hash: "aaa", subject: "feat(intelligence): add event" },
          { hash: "bbb", subject: "fix(receiver): correct coverage" },
        ],
        registry,
      ),
    ).toEqual(["Flight Intelligence", "Receiver Coverage"]);
  });

  it("uses conservative keywords when a user-facing commit has no conventional scope", () => {
    expect(
      featureNamesForCommits(
        [
          { hash: "aaa", subject: "feat: improve flight intelligence timeline" },
          { hash: "bbb", subject: "Merge remote-tracking branch 'origin/main'" },
        ],
        registry,
      ),
    ).toEqual(["Flight Intelligence"]);
  });

  it("prunes untagged modern release headings while preserving pre-authoritative history", () => {
    const existing = [
      "# Changelog",
      "",
      "## [1.0.150] - 2026-09-27",
      "",
      "Changes since v1.0.149.",
      "",
      "## [1.0.149] - 2026-09-27",
      "",
      "Changes since v1.0.148.",
      "",
      "## [1.0.148] - 2026-09-27",
      "",
      "Changes since v1.0.147.",
      "",
      "## [1.0.147] - 2026-09-27",
      "",
      "Historical pre-authoritative entry.",
      "",
    ].join("\n");

    expect(
      unexpectedChangelogVersions({
        existing,
        tags: ["v1.0.150", "v1.0.149", "v1.0.147"],
      }),
    ).toEqual(["1.0.148"]);

    const pruned = pruneUnexpectedChangelogVersions({
      existing,
      tags: ["v1.0.150", "v1.0.149", "v1.0.147"],
    });
    expect(pruned).not.toContain("## [1.0.148]");
    expect(pruned).toContain("## [1.0.147]");
  });

  it("prunes stale provisional headings before backfilling tagged releases", () => {
    const existing = [
      "# Changelog",
      "",
      "## [1.0.151] - 2026-09-27",
      "",
      "Provisional.",
      "",
      "## [1.0.150] - 2026-09-27",
      "",
      "Published.",
      "",
    ].join("\n");

    const updated = backfillChangelog({
      existing,
      tags: ["v1.0.152", "v1.0.150"],
      releases: {
        "v1.0.152": {
          date: "2026-09-27",
          commits: [{ hash: "abc1234", subject: "feat: improve flight intelligence timeline" }],
        },
      },
      registry,
    });

    expect(updated).not.toContain("## [1.0.151]");
    expect(updated).toContain("## [1.0.152]");
    expect(updated).toContain("**Features touched:** Flight Intelligence.");
  });

  it("renders readable sections and retains the complete technical audit trail", () => {
    const entry = createChangelogEntry({
      version: "1.2.3",
      date: "2026-09-27",
      previousTag: "v1.2.2",
      registry,
      commits: [
        { hash: "aaa1111", subject: "feat(intelligence): add event timeline" },
        { hash: "bbb2222", subject: "fix(receiver): correct coverage bounds" },
        { hash: "ccc3333", subject: "Merge pull request #123 from example" },
      ],
    });

    expect(entry).toContain("### Added");
    expect(entry).toContain("- Add event timeline (aaa1111)");
    expect(entry).toContain("### Fixed");
    expect(entry).toContain("- Correct coverage bounds (bbb2222)");
    expect(entry).toContain(
      "**Features touched:** Flight Intelligence, Receiver Coverage.",
    );
    expect(entry).toContain("<summary>Technical commits</summary>");
    expect(entry).toContain("Merge pull request #123 from example (ccc3333)");
  });
});
