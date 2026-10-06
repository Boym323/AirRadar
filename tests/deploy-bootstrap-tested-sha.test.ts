import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

describe("production deploy checkout bootstrap", () => {
  it("bridges only legacy release scripts to the exact CI-validated main SHA without privileged git", async () => {
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

    const detect = workflow.indexOf("- name: Detect legacy release bootstrap");
    const createTag = workflow.indexOf("- name: Create legacy validated-SHA bootstrap tag");
    const deploy = workflow.indexOf("- name: Deploy the tested commit locally");
    const cleanup = workflow.indexOf("- name: Remove legacy validated-SHA bootstrap tag");
    const verify = workflow.indexOf("- name: Verify deployed release identity");

    expect(detect).toBeGreaterThanOrEqual(0);
    expect(createTag).toBeGreaterThan(detect);
    expect(deploy).toBeGreaterThan(createTag);
    expect(cleanup).toBeGreaterThan(deploy);
    expect(verify).toBeGreaterThan(cleanup);

    const bootstrap = workflow.slice(detect, deploy);
    expect(bootstrap).toContain("branch_sha_line=");
    expect(bootstrap).toContain("tag_fetch_line=");
    expect(bootstrap).toContain("(( branch_sha_line < tag_fetch_line ))");
    expect(bootstrap).toContain("legacy=true");
    expect(bootstrap).toContain("0000000000-airradar-bootstrap-");
    expect(bootstrap).toContain('"sha":"%s"');
    expect(bootstrap).toContain('"${GITHUB_SHA}"');
    expect(bootstrap).toContain("/git/refs");
    expect(bootstrap).not.toContain("sudo -n git");
    expect(bootstrap).not.toContain("reset --hard");

    const release = workflow.slice(deploy, cleanup);
    expect(release).toContain("sudo -n /var/www/airradar/deploy/release.sh");
    expect(release).toContain("--branch main");
    expect(release).toContain("--automated");
    expect(release).toContain('--commit "${GITHUB_SHA}"');

    const cleanupBlock = workflow.slice(cleanup, verify);
    expect(cleanupBlock).toContain("if: always()");
    expect(cleanupBlock).toContain("/git/refs/tags/${BOOTSTRAP_TAG}");
    expect(cleanupBlock).toContain("Could not delete temporary bootstrap tag");
  });

  it("makes a legacy tag fetch resolve FETCH_HEAD to the validated commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "airradar-legacy-bootstrap-"));
    const remote = join(root, "remote.git");
    const source = join(root, "source");
    const production = join(root, "production");

    try {
      git(root, ["init", "--bare", remote]);
      await mkdir(source);
      git(source, ["init"]);
      git(source, ["config", "user.email", "airradar-test@example.invalid"]);
      git(source, ["config", "user.name", "AirRadar Test"]);
      await writeFile(join(source, "state.txt"), "old\n");
      git(source, ["add", "state.txt"]);
      git(source, ["commit", "-m", "old"]);
      git(source, ["branch", "-M", "main"]);
      git(source, ["remote", "add", "origin", remote]);
      git(source, ["push", "-u", "origin", "main"]);
      const oldSha = git(source, ["rev-parse", "HEAD"]);
      git(source, ["tag", "v1.0.0", oldSha]);
      git(source, ["push", "origin", "v1.0.0"]);

      await writeFile(join(source, "state.txt"), "new\n");
      git(source, ["add", "state.txt"]);
      git(source, ["commit", "-m", "new"]);
      git(source, ["push", "origin", "main"]);
      const validatedSha = git(source, ["rev-parse", "HEAD"]);

      await mkdir(production);
      git(production, ["init"]);
      git(production, ["remote", "add", "origin", remote]);
      git(production, ["fetch", "origin", "main"]);
      git(production, ["checkout", "-B", "main", oldSha]);
      git(production, ["config", "--unset-all", "remote.origin.fetch"]);
      git(production, ["config", "--add", "remote.origin.fetch", "+refs/tags/*:refs/tags/*"]);

      git(production, ["fetch", "origin", "main"]);
      git(production, ["fetch", "--force", "--tags", "origin"]);
      expect(git(production, ["rev-parse", "FETCH_HEAD"])).toBe(oldSha);

      const bootstrapTag = "0000000000-airradar-bootstrap-test";
      git(source, ["tag", bootstrapTag, validatedSha]);
      git(source, ["push", "origin", bootstrapTag]);

      git(production, ["fetch", "origin", "main"]);
      git(production, ["fetch", "--force", "--tags", "origin"]);
      expect(git(production, ["rev-parse", "FETCH_HEAD"])).toBe(validatedSha);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});