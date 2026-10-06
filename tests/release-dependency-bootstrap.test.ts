import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production release dependency bootstrap", () => {
  it("uses the locked project dependency graph for Prisma deploy tooling", async () => {
    const release = await readFile(new URL("../deploy/release.sh", import.meta.url), "utf8");

    expect(release).toContain("npm ci --prefer-offline --no-audit --no-fund");
    expect(release).toContain("npm run prisma:generate");
    expect(release).toContain("npm run prisma:deploy");
    expect(release).not.toContain("install_pinned_prisma_cli");
    expect(release).not.toContain("npm ci --omit=dev");
  });
});
