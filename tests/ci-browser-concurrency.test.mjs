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
      await new Promise((resolve) => setTimeout(resolve, value === 1 ? 1 : 20));
      settled++;
      if (value === 1) throw new Error("visual regression");
    }), /visual regression/,
  );
  assert.equal(started, settled);
  assert.equal(started, 2);
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

test("GPU-exclusive checks never overlap while regular checks can progress", async () => {
  const work = [
    { name: "gpu1", exclusive: true }, { name: "gpu2", exclusive: true },
    { name: "light1", exclusive: false }, { name: "light2", exclusive: false },
    { name: "gpu3", exclusive: true },
  ];
  let activeGPU = 0, maxGPU = 0, concurrentLight = 0; const seen = [];
  await runBoundedChecks(work, 2, async (item) => {
    if (item.exclusive) { activeGPU++; maxGPU = Math.max(maxGPU, activeGPU); }
    else if (activeGPU) concurrentLight++;
    await new Promise((resolve) => setTimeout(resolve, item.exclusive ? 8 : 2));
    seen.push(item.name);
    if (item.exclusive) activeGPU--;
  }, { isExclusive: (item) => item.exclusive });
  assert.equal(maxGPU, 1);
  assert.ok(concurrentLight >= 1);
  assert.deepEqual(seen.sort(), work.map((item) => item.name).sort());
});
test("exclusive-only work drains after idle worker exits", async () => {
  const done = [];
  await runBoundedChecks([1,2,3], 3, async (item) => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    done.push(item);
  }, { isExclusive: () => true });
  assert.deepEqual(done, [1,2,3]);
});
