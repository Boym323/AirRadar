/**
 * Run independent browser checks with a bounded number of workers.
 * The first failure prevents new tasks from starting, but running workers are
 * awaited before the caller closes Chromium. No detached page promises.
 */
export function boundedConcurrency(value, { fallback = 2, maximum = 3 } = {}) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`Invalid browser test concurrency ${value}; expected integer 1..${maximum}`);
  }
  return parsed;
}

export async function runBoundedChecks(items, concurrency, check, { isExclusive = () => false } = {}) {
  if (!Array.isArray(items) || typeof check !== "function" || typeof isExclusive !== "function") {
    throw new TypeError("runBoundedChecks expects an array, callback, and optional exclusive classifier");
  }
  const limit = boundedConcurrency(concurrency);
  // An exclusive check (GPU-intensive basemap/3D, or the full interaction
  // viewport matrix) never overlaps another exclusive check. Other workers
  // can continue with inexpensive independent checks while it is active.
  const pending = items.map((item, index) => ({ item, index, exclusive: Boolean(isExclusive(item)) }));
  let exclusiveRunning = false;
  let firstFailure = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!firstFailure) {
      const position = pending.findIndex((work) => !work.exclusive || !exclusiveRunning);
      if (position < 0) break;
      const [work] = pending.splice(position, 1);
      if (work.exclusive) exclusiveRunning = true;
      try {
        await check(work.item, work.index);
      } catch (error) {
        if (!firstFailure) firstFailure = error;
      } finally {
        if (work.exclusive) exclusiveRunning = false;
      }
    }
  });
  await Promise.all(workers);
  if (firstFailure) throw firstFailure;
}
