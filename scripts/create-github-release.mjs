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

async function github(path, body) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const notes = await github("/releases/generate-notes", {
  tag_name: tag,
  target_commitish: target,
});
const release = await github("/releases", {
  tag_name: tag,
  target_commitish: target,
  name: notes.name || tag,
  body: notes.body || "",
});
console.log(`Created GitHub release ${release.html_url}`);
