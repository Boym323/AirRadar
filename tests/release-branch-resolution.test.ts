import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("production release branch resolution", () => {
  it("preserves the fetched branch SHA before fetching tags", async () => {
    const release = await readFile(new URL("../deploy/release.sh", import.meta.url), "utf8");

    const branchFetch = release.indexOf('git_cmd fetch origin "${DEPLOY_BRANCH}"');
    const capture = release.indexOf('remote_sha="$(git_cmd rev-parse FETCH_HEAD)"');
    const tagFetch = release.indexOf("git_cmd fetch --force --tags origin");

    expect(branchFetch).toBeGreaterThanOrEqual(0);
    expect(capture).toBeGreaterThan(branchFetch);
    expect(tagFetch).toBeGreaterThan(capture);

    expect(release).toContain('merge_base="$(git_cmd merge-base HEAD "${target_sha}")"');
    expect(release).toContain('git_cmd merge --ff-only "${target_sha}"');
    expect(release).toContain('git_cmd reset --hard "${target_sha}"');
    expect(release).toContain('target_sha="${EXPECTED_COMMIT}"');
    expect(release).toContain('git_cmd merge-base --is-ancestor "${EXPECTED_COMMIT}" "${remote_sha}"');
    expect(release).toContain('git_cmd reset --hard "${target_sha}"');

    const updateRepository = release.slice(
      release.indexOf("update_repository() {"),
      release.indexOf("prepare_release_version() {"),
    );
    expect(updateRepository).not.toContain("merge-base HEAD FETCH_HEAD");
    expect(updateRepository).not.toContain("merge --ff-only FETCH_HEAD");
    expect(updateRepository).not.toContain("reset --hard FETCH_HEAD");

    const afterTagFetch = updateRepository.slice(
      updateRepository.indexOf("git_cmd fetch --force --tags origin"),
    );
    expect(afterTagFetch).not.toContain("FETCH_HEAD");
  });
});
