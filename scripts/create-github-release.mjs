const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const tag = process.env.RELEASE_TAG;
const target = process.env.GITHUB_SHA;

if (!repository || !token || !tag || !target) {
  throw new Error("GITHUB_REPOSITORY, GITHUB_TOKEN, RELEASE_TAG, and GITHUB_SHA are required.");
}

const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "content-type": "application/json",
};

class GitHubApiError extends Error {
  constructor(status, payload) {
    super(`GitHub API ${status}: ${JSON.stringify(payload)}`);
    this.name = "GitHubApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function github(method, path, body) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new GitHubApiError(response.status, payload);
  return payload;
}

async function existingRelease() {
  try {
    return await github("GET", `/releases/tags/${encodeURIComponent(tag)}`);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

async function main() {
  const existing = await existingRelease();
  if (existing) {
    console.log(`GitHub release ${tag} already exists at ${existing.html_url}; leaving it unchanged.`);
    return;
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
    console.log(`Created GitHub release ${release.html_url}`);
  } catch (error) {
    // A rerun/race may create the release between the initial GET and POST.
    if (error instanceof GitHubApiError && error.status === 422) {
      const raced = await existingRelease();
      if (raced) {
        console.log(`GitHub release ${tag} was created concurrently at ${raced.html_url}; treating it as success.`);
        return;
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
