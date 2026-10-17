import { test } from "node:test";
import assert from "node:assert/strict";
import { durationSetting, MIN_T57_SOAK_SECONDS } from "../scripts/t57-production-soak.mjs";

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
