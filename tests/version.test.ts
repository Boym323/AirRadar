import { describe, expect, it } from "vitest";
// @ts-expect-error The release helper is runtime-only ESM consumed by Node.
import { resolveReleaseVersion } from "../scripts/version.mjs";
// @ts-expect-error The changelog helper is runtime-only ESM consumed by Node.
import { backfillChangelog, createChangelogEntry, updateChangelog } from "../scripts/changelog.mjs";

describe("automatic release versioning", () => {
  it("starts a package major/minor series at patch zero", () => {
    expect(resolveReleaseVersion({ packageVersion: "0.1.0", headTags: [], seriesTags: [] })).toEqual({
      version: "0.1.0",
      tag: "v0.1.0",
      reused: false,
    });
  });

  it("increments only the highest tag in the package series", () => {
    expect(resolveReleaseVersion({
      packageVersion: "0.1.0",
      headTags: [],
      seriesTags: ["v0.1.2", "v0.1.17", "v0.2.9", "not-a-release-tag"],
    })).toMatchObject({ version: "0.1.18", tag: "v0.1.18", reused: false });
  });

  it("reuses a release tag already pointing at HEAD", () => {
    expect(resolveReleaseVersion({
      packageVersion: "0.1.0",
      headTags: ["v0.1.18"],
      seriesTags: ["v0.1.17", "v0.1.18"],
    })).toEqual({ version: "0.1.18", tag: "v0.1.18", reused: true });
  });

  it("does not reuse a tag from another package series", () => {
    expect(resolveReleaseVersion({
      packageVersion: "0.2.0",
      headTags: ["v0.1.18"],
      seriesTags: ["v0.1.18"],
    })).toEqual({ version: "0.2.0", tag: "v0.2.0", reused: false });
  });
});

describe("automatic changelog generation", () => {
  it("creates a release section from commits", () => {
    expect(createChangelogEntry({
      version: "0.1.10",
      date: "2026-09-09",
      previousTag: "v0.1.9",
      commits: [{ hash: "abc1234", subject: "feat: add changelog" }],
    })).toBe("## [0.1.10] - 2026-09-09\n\nChanges since v0.1.9:\n\n- feat: add changelog (abc1234)");
  });

  it("does not duplicate an existing release section", () => {
    const existing = "# Changelog\n\n## [0.1.10] - 2026-09-09\n";
    expect(updateChangelog({
      version: "0.1.10",
      date: "2026-09-09",
      existing,
      previousTag: "v0.1.9",
      commits: [],
    })).toBe(existing);
  });

  it("backfills missing tagged releases in descending order", () => {
    const backfilled = backfillChangelog({
      existing: "# Changelog\n\nAll notable changes to AirRadar are documented here.\n",
      tags: ["v0.1.2", "v0.1.1"],
      releases: {
        "v0.1.2": { date: "2026-09-02", commits: [] },
        "v0.1.1": { date: "2026-09-01", commits: [] },
      },
    });
    expect(backfilled).toContain("## [0.1.1]");
    expect(backfilled.indexOf("## [0.1.2]")).toBeLessThan(backfilled.indexOf("## [0.1.1]"));
  });
});
