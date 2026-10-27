import { test } from "node:test";
import assert from "node:assert/strict";
import { durationSetting, MIN_T57_SOAK_SECONDS, scheduledPollDelayMs } from "../scripts/t57-production-soak.mjs";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/t57-readonly-30min.yml", import.meta.url), "utf8");

test("short read-only production soak accepts exactly 30 minutes, not less", () => {
  assert.equal(MIN_T57_SOAK_SECONDS, 1800);
  const original = process.env.T57_SECONDS;
  try {
    process.env.T57_SECONDS = "1800";
    assert.equal(durationSetting("T57_SECONDS", 86400, MIN_T57_SOAK_SECONDS, 86400), 1800);
    process.env.T57_SECONDS = "1799";
    assert.throws(() => durationSetting("T57_SECONDS", 86400, MIN_T57_SOAK_SECONDS, 86400), /invalid_t57_schedule/);
    process.env.T57_SECONDS = "86400";
    assert.equal(durationSetting("T57_SECONDS", 86400, MIN_T57_SOAK_SECONDS, 86400), 86400);
  } finally {
    if (original === undefined) delete process.env.T57_SECONDS;
    else process.env.T57_SECONDS = original;
  }
});

test("chunk finalization keeps its cursor in scope and schedules each poll once", () => {
  const source = readFileSync(new URL("../scripts/t57-production-soak.mjs", import.meta.url), "utf8");
  const declaration = source.indexOf("let lastScheduledIndex");
  const tryBlock = source.indexOf("  try {", declaration);
  const finallyBlock = source.indexOf("  } finally {", tryBlock);
  assert.ok(declaration >= 0 && declaration < tryBlock);
  assert.equal((source.slice(tryBlock, finallyBlock).match(/let lastScheduledIndex/g) ?? []).length, 0);

  const target = 10_000;
  assert.equal(scheduledPollDelayMs(target, 9_000), 1_000);
  assert.equal(scheduledPollDelayMs(target, 10_001), 0);
});

test("30-minute workflow is manual, pinned, authenticated and sanitized", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /T57_WATCHLIST_ADMIN_TOKEN/);
  assert.match(workflow, /scripts\/t57-production-soak\.mjs --preflight/);
  assert.match(workflow, /scripts\/t57-production-soak\.mjs >/);
  assert.match(workflow, /T57_TOTAL_SECONDS: "1800"/);
  assert.match(workflow, /T57_INTERVAL_SECONDS: "30"/);
  assert.doesNotMatch(workflow, /T57_TOTAL_SECONDS: "86400"/);
  assert.doesNotMatch(workflow, /\$\{\{ runner\.temp\/t57-30m\/soak\.ndjson \}\}/);
  assert.match(workflow, /soak\.summary\.json/);
  assert.match(workflow, /soak\.summary\.md/);
});
