import { describe, expect, it } from "vitest";
import { classifyReleaseScope } from "../scripts/release-scope.mjs";

describe("release scope", () => {
  it.each([
    [["docs/DEVELOPMENT.md"], false],
    [["README.md", "docs/cs/DEVELOPMENT.md"], false],
    [["docs/metrics/code-history.json"], false],
    [["lib/server/aircraft-state.ts"], true],
    [["docs/DEVELOPMENT.md", "lib/server/aircraft-state.ts"], true],
    [["package.json"], true],
    [["prisma/contract.prisma"], true],
    [["migrations/app/example.sql"], true],
    [[".github/workflows/ci.yml"], true],
    [["foo/bar.xyz"], true],
  ])("classifies %j as deploy=%s", (files, deploy) => {
    expect(classifyReleaseScope(files).deploy).toBe(deploy);
  });

  it("keeps machine-readable documentation outside the safe allowlist", () => {
    expect(classifyReleaseScope(["docs/features.registry.json"]).deploy).toBe(true);
    expect(classifyReleaseScope(["docs/metrics/other.json"]).deploy).toBe(true);
  });
});
