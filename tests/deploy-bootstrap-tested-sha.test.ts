import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

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
});
