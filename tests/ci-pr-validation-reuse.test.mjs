import test from "node:test";
import assert from "node:assert/strict";
import { assessPreviewReuse, verify } from "../scripts/ci-pr-validation-reuse.mjs";

const mainSha = "a".repeat(40);
const headSha = "b".repeat(40);
const treeSha = "c".repeat(40);
const repo = "Boym323/AirRadar";
const pr = {
  number: 900, merged_at: "2026-10-13T20:10:00Z", merge_commit_sha: mainSha,
  base: { ref: "main" }, head: { repo: { full_name: repo }, sha: headSha, ref: "perf/preview-reuse" },
  labels: [{ name: "release-preview" }], changed_files: 1,
};
const ciRun = {
  id: 55, name: "CI", path: ".github/workflows/ci.yml",
  head_sha: headSha, head_branch: "perf/preview-reuse", head_repository: { full_name: repo }, event: "pull_request",
  conclusion: "success", status: "completed", updated_at: "2026-10-13T20:09:00Z",
  pull_requests: [{ number: 900, head: { sha: headSha }, base: { ref: "main" } }],
};
const codeql = { ...ciRun, id: 56, name: "CodeQL", path: ".github/workflows/codeql.yml" };
const required = ["Release scope", "Release validation", "Release tests and typecheck", "Release performance regression"]
  .map((name) => ({ name, conclusion: "success" }));
const jobs = [...required, { name: "Deploy production", conclusion: "skipped" }];
const evidence = {
  repository: repo, sha: mainSha, prs: [pr],
  mainCommit: { tree: { sha: treeSha } }, prCommit: { tree: { sha: treeSha } },
  changedFiles: [{ filename: "lib/server/aircraft-state.ts" }],
  runs: [ciRun, codeql], jobsByRun: new Map([[55, jobs]]),
};
const evaluate = (changes = {}) => assessPreviewReuse({ ...evidence, ...changes });

test("reuse is allowed only for exact-tree fully green authenticated preview", () => {
  assert.deepEqual(evaluate(), { reusable: true,
    reason: "exact tree and complete green release-preview", pr: 900, run: 55 });
});
test("direct main pushes and unrelated PR merges cannot reuse validation", () => {
  assert.equal(evaluate({ prs: [] }).reusable, false);
  assert.equal(evaluate({ prs: [{ ...pr, merge_commit_sha: headSha }] }).reusable, false);
  assert.equal(evaluate({ prs: [{ ...pr, labels: [] }] }).reusable, false);
  assert.equal(evaluate({ prs: [{ ...pr, head: { repo: { full_name: "attacker/fork" }, sha: headSha } }] }).reusable, false);
});
test("a changed source tree cannot reuse old PR tests", () => {
  assert.equal(evaluate({ prCommit: { tree: { sha: "d".repeat(40) } } }).reusable, false);
  assert.equal(evaluate({ mainCommit: { tree: {} } }).reusable, false);
});
test("guarded workflow/test harness changes always force full validation", () => {
  for (const filename of [".github/workflows/ci.yml", "scripts/ci-release-plan.mjs",
    "scripts/ci-pr-validation-reuse.mjs", "scripts/production-gates.mjs",
    "tests/ci-deploy-safety.test.mjs"]) {
    assert.equal(evaluate({ changedFiles: [{ filename }] }).reusable, false, filename);
  }
});
test("only a fully green release-preview AND CodeQL can be reused", () => {
  assert.equal(evaluate({ runs: [ciRun] }).reusable, false);
  assert.equal(evaluate({ runs: [{ ...ciRun, conclusion: "failure" }, codeql] }).reusable, false);
  for (const name of ["Release validation", "Release tests and typecheck", "Release performance regression"]) {
    const broken = jobs.map((job) => job.name === name ? { ...job, conclusion: "skipped" } : job);
    assert.equal(evaluate({ jobsByRun: new Map([[55, broken]]) }).reusable, false, name);
  }
});
test("incomplete scope and missing job evidence fail closed", () => {
  assert.equal(evaluate({ changedFiles: [] }).reusable, false);
  assert.equal(evaluate({ jobsByRun: new Map() }).reusable, false);
  assert.equal(evaluate({ prs: [{ ...pr, changed_files: 101 }] }).reusable, false);
  assert.equal(evaluate({ jobsByRun: new Map([[55, required]]) }).reusable, false);
});

test("GitHub-pruned pull_requests arrays can reuse the exact merged PR #917 tree", () => {
  // Real GitHub PR #917: the completed CI and CodeQL runs return
  // pull_requests: [] although branch, SHA, source repo and tree match.
  const runs = [ciRun, codeql].map((run) => ({ ...run, pull_requests: [] }));
  assert.equal(evaluate({ runs }).reusable, true);
});

test("empty PR associations require authenticated branch, SHA and repository", () => {
  const unlinked = { ...ciRun, pull_requests: [] };
  const cases = [
    { ...unlinked, head_branch: "perf/other" },
    { ...unlinked, head_sha: "f".repeat(40) },
    { ...unlinked, head_repository: { full_name: "fork/AirRadar" } },
    { ...unlinked, event: "push" },
    { ...unlinked, status: "in_progress" },
    { ...unlinked, pull_requests: undefined },
    { ...unlinked, pull_requests: [{ number: 901, head: { sha: headSha }, base: { ref: "main" } }] },
  ];
  for (const run of cases) {
    assert.equal(evaluate({ runs: [run, codeql] }).reusable, false, JSON.stringify(run));
  }
  assert.equal(evaluate({ runs: [unlinked, { ...codeql, pull_requests: [],
    head_repository: { full_name: "fork/AirRadar" } }] }).reusable, false);
  assert.equal(evaluate({ runs: [unlinked, { ...codeql, pull_requests: [],
    head_branch: "perf/wrong-branch" }] }).reusable, false);
  assert.equal(evaluate({ prs: [{ ...pr, head: { ...pr.head, ref: undefined } }],
    runs: [unlinked, { ...codeql, pull_requests: [] }] }).reusable, false);
  assert.equal(evaluate({ prs: [{ ...pr, head: { ...pr.head, ref: undefined } }],
    runs: [{ ...unlinked, head_branch: undefined },
      { ...codeql, head_branch: undefined, pull_requests: [] }] }).reusable, false);
  assert.equal(evaluate({ runs: [unlinked, { ...codeql, pull_requests: [
    { number: 901, head: { sha: headSha }, base: { ref: "main" } },
  ] }] }).reusable, false);
});

test("GitHub API discovery downloads jobs for PR runs with empty pull_requests", async () => {
  const associated = [ciRun, codeql].map((run) => ({ ...run, pull_requests: [] }));
  const endpoints = [];
  const mocked = new Map([
    [`/commits/${mainSha}/pulls?per_page=20`, [pr]],
    [`/pulls/${pr.number}`, pr],
    [`/git/commits/${mainSha}`, evidence.mainCommit],
    [`/git/commits/${headSha}`, evidence.prCommit],
    [`/pulls/${pr.number}/files?per_page=100`, evidence.changedFiles],
    [`/actions/runs?event=pull_request&head_sha=${headSha}&per_page=100`,
      { workflow_runs: associated }],
    [`/actions/runs/${ciRun.id}/jobs?per_page=100`, { total_count: jobs.length, jobs }],
  ]);
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    const prefix = `/repos/${repo}`;
    assert.ok(parsed.pathname.startsWith(prefix));
    const key = parsed.pathname.slice(prefix.length) + parsed.search;
    endpoints.push(key);
    assert.ok(mocked.has(key), `unexpected GitHub API call: ${key}`);
    return { ok: true, json: async () => mocked.get(key) };
  };
  const opts = { repository: repo, sha: mainSha, token: "mock-token", fetchImpl };
  assert.deepEqual(await verify(opts), {
    reusable: true, reason: "exact tree and complete green release-preview", pr: 900, run: 55,
  });
  assert.ok(endpoints.includes(`/actions/runs/${ciRun.id}/jobs?per_page=100`));

  // A truncated jobs page or conflicting CodeQL association must fail closed.
  mocked.set(`/actions/runs/${ciRun.id}/jobs?per_page=100`,
    { total_count: 101, jobs });
  assert.equal((await verify(opts)).reusable, false);
  mocked.set(`/actions/runs/${ciRun.id}/jobs?per_page=100`,
    { total_count: jobs.length, jobs });
  mocked.set(`/actions/runs?event=pull_request&head_sha=${headSha}&per_page=100`,
    { workflow_runs: [associated[0], { ...associated[1], pull_requests: [
      { number: 901, head: { sha: headSha }, base: { ref: "main" } },
    ] }] });
  assert.equal((await verify(opts)).reusable, false);
});
