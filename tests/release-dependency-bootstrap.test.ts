import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production release dependency bootstrap", () => {

  function checkPreparedBootstrap(versionPayload: string, hasPrismaChanges: boolean): string {
    const shell = [
      'source deploy/release.sh',
      'AUTOMATED=1',
      'PREPARED_BUILD_ROOT=/tmp/validated-production-artifact',
      'NEW_SHA=97629472d1a2041216d7d43143a46ed68a7c9e0b',
      'curl() { printf "%s" ' + JSON.stringify(versionPayload) + '; }',
      'git_cmd() {',
      '  case "$1" in',
      '    cat-file) [[ "$2" == "-e" && "$3" == "b5240f92^{commit}" ]] ;;',
      '    diff)',
      '      [[ "$2" == "--quiet" && "$3" == "b5240f92" && "$4" == "$NEW_SHA" && "$5" == "--" && "$6" == "migrations" && "$7" == "prisma" && "$8" == "prisma.config.ts" ]] || return 2',
      hasPrismaChanges ? '      return 1 ;;' : '      return 0 ;;',
      '    *) return 2 ;;',
      '  esac',
      '}',
      'if prepared_artifact_needs_no_prisma_bootstrap; then printf "SKIP\n"; else printf "BOOTSTRAP\n"; fi',
    ].join("\n");

    return execFileSync("bash", ["-c", shell], { encoding: "utf8" });
  }

  it("reuses a validated artifact without npm ci when served Prisma sources are unchanged", () => {
    const result = checkPreparedBootstrap('{"channel":"production","commit":"b5240f92"}', false);
    expect(result).toContain("SKIP");
    expect(result).toContain("skipping redundant npm ci/Prisma tooling");
  });

  it("retains the locked dependency/bootstrap path for changed Prisma sources", () => {
    const result = checkPreparedBootstrap('{"channel":"production","commit":"b5240f92"}', true);
    expect(result).toContain("BOOTSTRAP");
    expect(result).toContain("Prisma sources/migrations changed");
  });

  it("fails closed if deployed release identity cannot be trusted", () => {
    const result = checkPreparedBootstrap('{"channel":"preview","commit":"b5240f92"}', false);
    expect(result).toContain("BOOTSTRAP");
  });

  it("uses the locked project dependency graph for Prisma deploy tooling", async () => {
    const release = await readFile(new URL("../deploy/release.sh", import.meta.url), "utf8");

    expect(release).toContain("npm ci --prefer-offline --no-audit --no-fund");
    expect(release).toContain("npm run prisma:generate");
    expect(release).toContain("npm run prisma:deploy");
    expect(release).not.toContain("install_pinned_prisma_cli");
    expect(release).not.toContain("npm ci --omit=dev");
  });
});
