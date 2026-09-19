import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("automated release generated-file recovery", () => {
  it("recovers only the known Next release-generated files before dirty preflight", async () => {
    const release = await readFile(new URL("../deploy/release.sh", import.meta.url), "utf8");
    expect(release).toContain("clean_automated_generated_changes");
    expect(release).toContain("  clean_automated_generated_changes\n  check_repository");
    expect(release).toContain('git_cmd restore -- next-env.d.ts tsconfig.json');
    expect(release).toContain('grep -Eq \'^import "\\./\\.next-release-[^/]+/types/routes\\.d\\.ts";$\'');
    expect(release).toContain('grep -Eq \'"\\.next-release-[^/]+/types/\\*\\*/\\*\\.ts"\'');
  });
});
