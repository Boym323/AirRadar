import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Runtime-only ESM release helper.
import { createGitHubRelease } from "../scripts/create-github-release.mjs";

function response(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("continuous deploy release workflow", () => {
  it("syncs remote release tags in the privileged release path and delegates idempotency to the publisher", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const release = readFileSync(new URL("../deploy/release.sh", import.meta.url), "utf8");
    expect(release).toContain("git_cmd fetch --force --tags origin");
    expect(workflow).toContain('RELEASE_TAG="${release_tag}" node /var/www/airradar/scripts/create-github-release.mjs');
    expect(workflow).not.toContain('if git rev-parse --verify --quiet "refs/tags/${release_tag}"');
  });
});

describe("GitHub release publishing", () => {
  const base = {
    repository: "Boym323/AirRadar",
    token: "test-token",
    tag: "v1.0.1",
    target: "abc1234",
    log: vi.fn(),
  };

  it("treats an existing release as success without trying to recreate it", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      response(200, { html_url: "https://github.com/Boym323/AirRadar/releases/tag/v1.0.1" }));

    const result = await createGitHubRelease({ ...base, fetchImpl });

    expect(result.status).toBe("existing");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("creates release notes and a release when the tag has no GitHub Release", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      response(500, { message: "unexpected call" }))
      .mockResolvedValueOnce(response(404, { message: "Not Found" }))
      .mockResolvedValueOnce(response(200, { name: "v1.0.1", body: "notes" }))
      .mockResolvedValueOnce(response(201, { html_url: "https://github.com/Boym323/AirRadar/releases/tag/v1.0.1" }));

    const result = await createGitHubRelease({ ...base, fetchImpl });

    expect(result.status).toBe("created");
    expect(fetchImpl.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "POST", "POST"]);
  });

  it("treats a concurrent already-exists race as success after rechecking the release", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      response(500, { message: "unexpected call" }))
      .mockResolvedValueOnce(response(404, { message: "Not Found" }))
      .mockResolvedValueOnce(response(200, { name: "v1.0.1", body: "notes" }))
      .mockResolvedValueOnce(response(422, { message: "Validation Failed" }))
      .mockResolvedValueOnce(response(200, { html_url: "https://github.com/Boym323/AirRadar/releases/tag/v1.0.1" }));

    const result = await createGitHubRelease({ ...base, fetchImpl });

    expect(result.status).toBe("existing");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
