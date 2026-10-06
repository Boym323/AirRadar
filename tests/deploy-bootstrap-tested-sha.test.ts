import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production deploy checkout bootstrap", () => {
  it("aligns production only to the exact CI-validated main SHA before running release.sh", async () => {
    const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

    const align = workflow.indexOf("- name: Align production checkout to tested commit");
    const deploy = workflow.indexOf("- name: Deploy the tested commit locally");

    expect(align).toBeGreaterThanOrEqual(0);
    expect(deploy).toBeGreaterThan(align);

    const bootstrap = workflow.slice(align, deploy);
    expect(bootstrap).toContain('fetch origin main');
    expect(bootstrap).toContain('fetched_sha="$("${git_prod[@]}" rev-parse FETCH_HEAD)"');
    expect(bootstrap).toContain('if [[ "${fetched_sha}" != "${GITHUB_SHA}" ]]');
    expect(bootstrap).toContain('status --porcelain');
    expect(bootstrap).toContain('refusing to reset it');
    expect(bootstrap).toContain('reset --hard "${fetched_sha}"');
    expect(bootstrap).toContain('resolved_sha="$("${git_prod[@]}" rev-parse HEAD)"');
    expect(bootstrap).toContain('[[ "${resolved_sha}" == "${GITHUB_SHA}" ]]');
  });
});
