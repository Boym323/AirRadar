import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class GitHubApiError extends Error {
  constructor(status, payload) {
    super(`GitHub API ${status}: ${JSON.stringify(payload)}`);
    this.name = "GitHubApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function createGitHubRelease({
  repository,
  token,
  tag,
  target,
  fetchImpl = fetch,
  log = console.log,
}) {
  if (!repository || !token || !tag || !target) {
    throw new Error("GITHUB_REPOSITORY, GITHUB_TOKEN, RELEASE_TAG, and GITHUB_SHA are required.");
  }

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
  };

  const github = async (method, path, body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new GitHubApiError(response.status, payload);
    return payload;
  };

  const existingRelease = async () => {
    try {
      return await github("GET", `/releases/tags/${encodeURIComponent(tag)}`);
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  };

  const tagCommit = async () => {
    const reference = await github("GET", `/git/ref/tags/${encodeURIComponent(tag)}`);
    if (reference.object?.type === "commit" && typeof reference.object.sha === "string") {
      return reference.object.sha;
    }
    if (reference.object?.type === "tag" && typeof reference.object.sha === "string") {
      const annotated = await github("GET", `/git/tags/${encodeURIComponent(reference.object.sha)}`);
      if (annotated.object?.type === "commit" && typeof annotated.object.sha === "string") return annotated.object.sha;
    }
    throw new Error(`GitHub tag ${tag} does not resolve to a commit.`);
  };

  const verifyTagTarget = async () => {
    const actual = await tagCommit();
    if (actual.toLowerCase() !== target.toLowerCase()) {
      throw new Error(`GitHub tag ${tag} points at ${actual}, expected deployed artifact ${target}. Refusing to accept the release.`);
    }
    log(`GitHub tag ${tag} resolves to deployed artifact ${target}.`);
  };

  const existing = await existingRelease();
  if (existing) {
    await verifyTagTarget();
    log(`GitHub release ${tag} already exists at ${existing.html_url}; leaving it unchanged.`);
    return { status: "existing", release: existing };
  }

  const notes = await github("POST", "/releases/generate-notes", {
    tag_name: tag,
    target_commitish: target,
  });

  try {
    const release = await github("POST", "/releases", {
      tag_name: tag,
      target_commitish: target,
      name: notes.name || tag,
      body: notes.body || "",
    });
    await verifyTagTarget();
    log(`Created GitHub release ${release.html_url}`);
    return { status: "created", release };
  } catch (error) {
    // A rerun/race may create the release between the initial GET and POST.
    if (error instanceof GitHubApiError && error.status === 422) {
      const raced = await existingRelease();
      if (raced) {
        await verifyTagTarget();
        log(`GitHub release ${tag} was created concurrently at ${raced.html_url}; treating it as success.`);
        return { status: "existing", release: raced };
      }
    }
    throw error;
  }
}

async function main() {
  await createGitHubRelease({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    tag: process.env.RELEASE_TAG,
    target: process.env.RELEASE_TARGET || process.env.GITHUB_SHA,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
