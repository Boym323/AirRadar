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

export async function runBoundedChecks(items, concurrency, check) {
  if (!Array.isArray(items) || typeof check !== "function") {
    throw new TypeError("runBoundedChecks expects an array and callback");
  }
  const limit = boundedConcurrency(concurrency);
  let cursor = 0;
  let firstFailure = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!firstFailure && cursor < items.length) {
      const current = cursor++;
      try {
        await check(items[current], current);
      } catch (error) {
        if (!firstFailure) firstFailure = error;
      }
    }
  });
  await Promise.all(workers);
  if (firstFailure) throw firstFailure;
}
