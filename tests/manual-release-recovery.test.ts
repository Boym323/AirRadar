import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("manual recovery retains one previous standalone runtime", () => {
  const release = readFileSync(new URL("../deploy/release.sh", import.meta.url), "utf8");
  const recovery = readFileSync(new URL("../deploy/recover-previous-build.sh", import.meta.url), "utf8");

  it("preserves an old runtime only after successful rollout and never automatically switches it", () => {
    expect(release).toContain('readonly RELEASE_BUILD_BACKUP_DIR=".next-previous"');
    expect(release).toContain('Retained previous runtime at');
    expect(release).toContain('No automatic code or database rollback was attempted');
    expect(release).not.toContain('rm -rf -- "${backup_build}"\n}');
  });

  it("requires both immutable build IDs and explicit migration compatibility acknowledgement", () => {
    expect(recovery).toContain("--acknowledge-schema-compatible");
    expect(recovery).toContain('--expected-active');
    expect(recovery).toContain('--expected-previous');
    expect(recovery).toContain('flock -n 9');
    expect(recovery).toContain('flock -n 8');
    expect(recovery).toContain('systemctl is-active --quiet');
    expect(recovery).toContain('local health gate');
    expect(recovery).not.toContain("prisma:deploy");
  });

  it("is valid bash syntax", () => {
    expect(() => execFileSync("bash", ["-n", "deploy/recover-previous-build.sh"])).not.toThrow();
  });
});
