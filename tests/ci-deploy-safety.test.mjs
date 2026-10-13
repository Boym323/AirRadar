import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const job = (name) => {
  const start = workflow.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `missing job ${name}`);
  const tail = workflow.slice(start + name.length + 4);
  const next = tail.search(/\n  [a-z][a-z-]*:\n/);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + name.length + 4 + next);
};

test("PR previews cannot trigger self-hosted production deploy", () => {
  const deploy = job("deploy");
  assert.match(deploy, /^    if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && needs\.release-scope\.outputs\.deploy == 'true'$/m);
  assert.doesNotMatch(deploy, /release-preview|pull_request/);
  assert.match(deploy, /runs-on: \[self-hosted, linux, x64\]/);
});
test("all release gates run in maintainer-requested previews", () => {
  for (const name of ["release-scope", "release-validate", "release-tests", "release-performance"]) {
    assert.match(job(name), /release-preview/, name);
  }
  assert.match(job("deploy"), /release-tests, release-performance/);
});

test("release browser throughput remains within the tested bounded scheduler", () => {
  const release = job("release-validate");
  assert.match(release, /AIRRADAR_VISUAL_CONCURRENCY: '3'/);
  assert.match(release, /AIRRADAR_VIEWPORT_CONCURRENCY: '3'/);
  assert.match(release, /npm run test:production:all/);
});
