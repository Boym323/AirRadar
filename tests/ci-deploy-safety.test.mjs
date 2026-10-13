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

test("release-preview skips duplicated PR validation, not release quality gates", () => {
  const validate = job("validate");
  assert.match(validate, /!contains\(github\.event\.pull_request\.labels\.\*\.name, 'release-preview'\)/);
  const tests = job("release-tests");
  for (const command of [
    "npm audit --omit=dev --audit-level=high", "npm run lint",
    "npm run features:check", "npm run docs:check",
    "npm run visual:check", "npm run icons:audit",
    "npm run changelog:check", "npm run typecheck:prepared",
    "npm run test:full", "npx prisma migration check",
  ]) assert.ok(tests.includes(command), command);
  const release = job("release-validate");
  assert.match(release, /npm run test:production:all/);
  assert.match(job("deploy"), /needs: \[release-scope, release-validate, release-tests, release-performance\]/);
});
