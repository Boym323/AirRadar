import { describe, expect, it } from "vitest";
// @ts-expect-error The changelog helper is runtime-only ESM consumed by Node.
import { GRANDFATHERED_MISSING_RELEASES, missingChangelogVersions } from "../scripts/changelog.mjs";

describe("changelog release-history contract", () => {
  const authoritativeFrom = "1.0.148";

  it("ignores the pre-authoritative v1.0.48 tag", () => {
    expect(missingChangelogVersions({
      existing: "## [1.0.148]\n",
      tags: ["v1.0.149", "v1.0.48"],
      authoritativeFrom,
    })).toEqual(["1.0.149"]);
  });

  it("accepts the documented v1.0.197 reconciliation exception", () => {
    expect(missingChangelogVersions({
      existing: "",
      tags: ["v1.0.197"],
      authoritativeFrom,
      grandfatheredVersions: GRANDFATHERED_MISSING_RELEASES,
    })).toEqual([]);
  });

  it("still rejects a future tagged release without a heading", () => {
    expect(missingChangelogVersions({
      existing: "## [1.0.198]\n",
      tags: ["v1.0.198", "v1.0.199"],
      authoritativeFrom,
      grandfatheredVersions: GRANDFATHERED_MISSING_RELEASES,
    })).toEqual(["1.0.199"]);
  });

  it("accepts a valid current tag and release heading pair", () => {
    expect(missingChangelogVersions({
      existing: "## [1.0.199]\n",
      tags: ["v1.0.199"],
      authoritativeFrom,
      grandfatheredVersions: GRANDFATHERED_MISSING_RELEASES,
    })).toEqual([]);
  });
});
