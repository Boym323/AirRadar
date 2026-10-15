/**
 * Run a large snapshot's asynchronous work with bounded scheduling.
 *
 * The downstream provider limit still controls I/O. This limit prevents a
 * single snapshot from allocating thousands of promises waiting on that limit.
 * Workers claim indexes synchronously so output order matches input order.
 */
export async function mapSettledBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError("invalid_bounded_concurrency");
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await operation(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}

/**
 * Same bound for providers whose contract already catches failures and must
 * return an ordered all-or-rejected result like Promise.all().
 */
export async function mapBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new RangeError("invalid_bounded_concurrency");
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await operation(items[index]!, index);
    }
  }));
  return results;
}
