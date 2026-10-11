import test from "node:test";
import assert from "node:assert/strict";
import { boundedConcurrency, runBoundedChecks } from "../scripts/ci-browser-concurrency.mjs";

test("bounded scheduler visits each check once with limited concurrency", async () => {
  let inFlight = 0; let maxSeen = 0; const seen = [];
  await runBoundedChecks([0,1,2,3,4,5,6], 2, async (value) => {
    inFlight += 1; maxSeen = Math.max(inFlight, maxSeen); seen.push(value);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
  });
  assert.equal(maxSeen, 2);
  assert.deepEqual(seen.sort((a,b)=>a-b), [0,1,2,3,4,5,6]);
});

test("first failure is propagated only after in-flight workers settle", async () => {
  let settled = 0; let started = 0;
  await assert.rejects(
    runBoundedChecks([0,1,2,3], 2, async (value) => {
      started++;
      await new Promise((resolve) => setTimeout(resolve, value === 1 ? 5 : 1));
      settled++;
      if (value === 1) throw new Error("visual regression");
    }), /visual regression/,
  );
  assert.equal(started, settled);
  assert.ok(started <= 3);
});
test("config is bounded and fail-closed", () => {
  assert.equal(boundedConcurrency(undefined), 2);
  assert.equal(boundedConcurrency("1"), 1);
  assert.equal(boundedConcurrency("3"), 3);
  for (const n of ["0", "4", "1.5", "oops", "-1"]) {
    assert.throws(() => boundedConcurrency(n), /Invalid browser test concurrency/);
  }
});
test("empty worklist has no checks", async () => {
  await runBoundedChecks([], 2, () => { throw new Error("unexpected"); });
});
