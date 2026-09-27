import { describe, expect, it } from "vitest";
import {
  categorizeCommit,
  createChangelogEntry,
  featureNamesForCommits,
  formatSummarySubject,
  parseConventionalSubject,
} from "../scripts/changelog.mjs";

const registry = {
  features: [
    {
      name: "Flight Intelligence",
      changelogScopes: ["intelligence"],
    },
    {
      name: "Receiver Coverage",
      changelogScopes: ["receiver"],
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
