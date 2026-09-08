import { describe, expect, it } from "vitest";
// @ts-expect-error The release helper is runtime-only ESM consumed by Node.
import { resolveReleaseVersion } from "../scripts/version.mjs";

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
