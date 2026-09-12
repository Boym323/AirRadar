import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The release helper is runtime-only ESM consumed by Node.
import { createBuildMetadata, parseReleaseVersion, resolveReleaseVersion } from "../scripts/version.mjs";
// @ts-expect-error The changelog helper is runtime-only ESM consumed by Node.
import { backfillChangelog, createChangelogEntry, normalizeChangelog, updateChangelog } from "../scripts/changelog.mjs";
import { parseBuildMetadata } from "../lib/server/version";

describe("automatic release versioning", () => {
  it("starts a package major/minor series at patch zero", () => {
    expect(resolveReleaseVersion({ packageVersion: "0.1.0", headTags: [], seriesTags: [] })).toEqual({
      version: "0.1.0",
      tag: "v0.1.0",
      reused: false,
    });
  });

  it("supports the first stable 1.0.0 release series without creating a tag", () => {
    expect(resolveReleaseVersion({ packageVersion: "1.0.0", headTags: [], seriesTags: ["v0.1.13"] })).toEqual({
      version: "1.0.0",
      tag: "v1.0.0",
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

describe("release candidate versioning", () => {
  it("starts the first RC for the exact base release series", () => {
    expect(resolveReleaseVersion({
      packageVersion: "1.0.0",
      headTags: [],
      seriesTags: ["v0.1.13"],
      channel: "rc",
    })).toEqual({ version: "1.0.0-rc.1", tag: "v1.0.0-rc.1", reused: false });
  });

  it("increments only RC tags from the exact base release", () => {
    expect(resolveReleaseVersion({
      packageVersion: "1.0.0",
      headTags: [],
      seriesTags: ["v0.1.13", "v1.0.0-rc.1"],
      channel: "rc",
    })).toEqual({ version: "1.0.0-rc.2", tag: "v1.0.0-rc.2", reused: false });
  });

  it("ignores RC tags when resolving the first stable release", () => {
    expect(resolveReleaseVersion({
      packageVersion: "1.0.0",
      headTags: [],
      seriesTags: ["v0.1.13", "v1.0.0-rc.1", "v1.0.0-rc.2"],
    })).toEqual({ version: "1.0.0", tag: "v1.0.0", reused: false });
  });

  it("increments stable patches after the stable base tag exists", () => {
    expect(resolveReleaseVersion({
      packageVersion: "1.0.0",
      headTags: [],
      seriesTags: ["v1.0.0-rc.1", "v1.0.0", "v1.0.0-rc.2"],
    })).toEqual({ version: "1.0.1", tag: "v1.0.1", reused: false });
  });

  it("reuses an RC tag already pointing at HEAD", () => {
    expect(resolveReleaseVersion({
      packageVersion: "1.0.0",
      headTags: ["v1.0.0-rc.1"],
      seriesTags: ["v1.0.0-rc.1"],
      channel: "rc",
    })).toEqual({ version: "1.0.0-rc.1", tag: "v1.0.0-rc.1", reused: true });
  });

  it("does not consume an RC number when the previous candidate was untagged", () => {
    const tags: string[] = [];
    const first = resolveReleaseVersion({ packageVersion: "1.0.0", headTags: tags, seriesTags: tags, channel: "rc" });
    const retry = resolveReleaseVersion({ packageVersion: "1.0.0", headTags: tags, seriesTags: tags, channel: "rc" });
    expect(first).toEqual({ version: "1.0.0-rc.1", tag: "v1.0.0-rc.1", reused: false });
    expect(retry).toEqual(first);
  });

  it("ignores unrelated release series", () => {
    expect(resolveReleaseVersion({
      packageVersion: "1.0.0",
      headTags: [],
      seriesTags: ["v0.1.13", "v2.0.0-rc.9"],
      channel: "rc",
    })).toEqual({ version: "1.0.0-rc.1", tag: "v1.0.0-rc.1", reused: false });
  });

  it("rejects non-canonical prerelease values", () => {
    for (const version of ["1.0.0-rc", "1.0.0-rc.0", "1.0.0-foo.1", "1.0-rc.1", "1.0.0-rc.01"]) {
      expect(() => parseReleaseVersion(version)).toThrow();
    }
  });

  it("preserves RC metadata through build and API validation", () => {
    vi.stubEnv("AIRRADAR_VERSION", "1.0.0-rc.1");
    vi.stubEnv("AIRRADAR_TAG", "v1.0.0-rc.1");
    vi.stubEnv("AIRRADAR_CHANNEL", "release-candidate");
    try {
      const metadata = createBuildMetadata({ packageVersion: "1.0.0" });
      expect(metadata).toMatchObject({ version: "1.0.0-rc.1", tag: "v1.0.0-rc.1", channel: "release-candidate" });
      expect(parseBuildMetadata(metadata)).toMatchObject({ version: "1.0.0-rc.1", channel: "release-candidate" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps stable and RC channels distinct", () => {
    vi.stubEnv("AIRRADAR_VERSION", "1.0.0");
    vi.stubEnv("AIRRADAR_TAG", "v1.0.0");
    vi.stubEnv("AIRRADAR_CHANNEL", "production");
    try {
      expect(createBuildMetadata({ packageVersion: "1.0.0" })).toMatchObject({ version: "1.0.0", channel: "production" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps RC dry-run before all release mutations", () => {
    const release = readFileSync(new URL("../deploy/release.sh", import.meta.url), "utf8");
    expect(release).toContain("--channel MODE");
    expect(release).toContain("Candidate: version=${resolved_version} tag=v${resolved_version} channel=${RELEASE_BUILD_CHANNEL}");
    expect(release.indexOf("  if (( DRY_RUN == 1 ));"))
      .toBeLessThan(release.indexOf("\n  acquire_lock"));
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

  it("inserts new releases immediately after the changelog introduction", () => {
    const existing = "# Changelog\n\nAll notable changes to AirRadar are documented here.\n\n## [0.1.9] - 2026-09-09\n";
    const updated = updateChangelog({
      version: "0.1.10",
      date: "2026-09-09",
      existing,
      previousTag: "v0.1.9",
      commits: [],
    });
    expect(updated.indexOf("## [0.1.10]")).toBeLessThan(updated.indexOf("## [0.1.9]"));
  });

  it("normalizes existing releases in descending version order", () => {
    const normalized = normalizeChangelog("# Changelog\n\nIntro\n\n## [0.1.9] - 2026-09-09\n\nold\n\n## [1.0.0] - 2026-09-09\n\nnew\n");
    expect(normalized.indexOf("## [1.0.0]")).toBeLessThan(normalized.indexOf("## [0.1.9]"));
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
