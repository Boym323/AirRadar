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
  assert.match(release, /AIRRADAR_VISUAL_CONCURRENCY: '2'/);
  // The 3-worker full visual matrix caused intermittent hidden drawer and
  // timeout failures on two main-branch releases; prioritize release reliability.
  assert.match(release, /AIRRADAR_VIEWPORT_CONCURRENCY: '3'/);
  assert.match(release, /npm run test:production:all/);
});

test("production release logs stream live with pipefail and retain flock retry detection", () => {
  const deploy = job("deploy");
  assert.match(deploy, /set -Eeuo pipefail/);
  assert.match(deploy, /--commit "\$\{GITHUB_SHA\}" 2>&1 \| tee "\$\{output\}"/);
  assert.match(deploy, /if grep -Fq 'Another AirRadar release is already running\.'/);
  assert.match(deploy, /exit "\$\{result\}"/);
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

test("validated PR previews can reduce main gates only after fail-closed trust checks", () => {
  const scope = job("release-scope");
  assert.match(scope, /contents: read/);
  assert.match(scope, /pull-requests: read/);
  assert.match(scope, /actions: read/);
  assert.match(scope, /node scripts\/ci-pr-validation-reuse\.mjs/);
  assert.match(scope, /if: steps\.preview\.outputs\.reuse == 'true'/);
  assert.match(scope, /validated_preview: \$\{\{ steps\.preview\.outputs\.reuse \}\}/);
  assert.match(scope, /fast\.browser !== "fast"/);
  const checks = job("release-tests");
  assert.match(checks, /if \[\[ "\$AIRRADAR_VALIDATED_PREVIEW" == "true" \]\]/);
  assert.match(checks, /npm run test:full/);
  assert.match(checks, /npm run test:targeted -- tests\/aircraft-state\.test\.ts/);
  assert.match(checks, /npm run typecheck:prepared/);
  assert.match(job("release-validate"), /npm run test:production:all/);
  assert.match(job("release-performance"), /npm run benchmark:radar/);
  assert.match(job("deploy"), /needs: \[release-scope, release-validate, release-tests, release-performance\]/);
});

test("all PR preview changes are checked relative to the PR base commit", () => {
  const scope = job("release-scope");
  assert.match(scope, /PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(scope, /git diff --name-only -z "\$PR_BASE_SHA" HEAD > "\$changes"/);
  assert.match(scope, /Cannot verify PR base: selecting full release gates/);
  assert.match(scope, /Cannot verify push base: selecting full release gates/);
});
